# 수원대학교 전 건물 도식화 실내지도 & 상호작용 가이드 (`suwon_building_maps`)

이 폴더 **하나만** UI/앱 개발자에게 전달하면, 별도 CAD 파싱 없이 바로 웹/앱에서 **개별 강의실 색칠**, **시설 구분 표시**, **복도 전용 길찾기 경로 렌더링**, 그리고 **AI 기반 UI 통합/수정**을 즉시 진행할 수 있습니다.

---

## 1. 폴더 구조 (건물별 · 층별 정리)

```text
suwon_building_maps/
├── README_AI_GUIDE.md          # 이 설명서 (개발자 & AI 프롬프트 가이드)
├── catalog.json                # 전 건물 마스터 목록, 층 목록, 섹터 수 인덱스
├── suwonBuildingMap.js         # 제로 의존성 통합 JS API (브라우저 & Node 공용 UMD)
├── suwonBuildingMap.d.ts       # TypeScript 타입 정의 파일
├── viewer.html                 # 전 건물·층별 확인 & 클릭 색칠/길찾기 테스트 뷰어
│
├── 01_humanities_college/      # 01. 인문사회대학
│   ├── data.json               # 건물 전체 층·섹터·문(doorPos)·복도그래프·계단/ELV 샤프트
│   └── floors/
│       ├── 1F.svg              # 단독 사용 가능한 도식화 SVG (모든 섹터에 data-* 속성 내장)
│       └── ... 5F.svg
├── ...
├── 12_global_business/         # 12. 글로벌경상관 (B3F ~ 14F)
│   ├── data.json
│   ├── floors/ (B3F.svg ~ 14F.svg)
│   └── references/             # 공식 블로그(usw1982) 실제 층별 배치 참고도 (B1~7F, 11F)
├── 13_central_library/         # 13. 중앙도서관 + 1~6F 참고도
├── 14_student_union/           # 14. 학생회관 + 층별 시설 안내 텍스트
├── 15_art_college/             # 15. 미술대학 + 1~3F 참고도
├── ...
├── 21_music_college/           # 21. 음악대학 + 1~3F 참고도
├── 22_amaranth_hall/           # 22. 복지관(아마랜스홀) + 층별 시설 안내 텍스트
├── 23_lecture_hall/            # 23. 종합강의동 + 1,2,3,5,6F 참고도
└── 24_it_college/              # 24. IT대학 (1F ~ 5F + 1~3F 참고도)
```

> 참고: `본관(main_building)`은 원본 `수원대학교 건물도면`에 CAD PDF 파일이 없어 제외되었으며, CAD 도면이 존재하는 캠퍼스 **23개 건물 전체**가 건물별·층별로 포함되어 있습니다.

---

## 2. 즉시 눈으로 확인하기 (로컬 실행)

이 폴더는 `fetch()`로 `catalog.json`과 `data.json`을 읽으므로 로컬 HTTP 서버로 실행해야 합니다.

```bash
cd suwon_building_maps
npx serve . -p 8089
# 또는
python -m http.server 8089
```

브라우저에서 `http://localhost:8089/viewer.html` 을 열면 23개 건물 모든 층의 SVG 도면, 강의실 개별 색칠, 복도 전용 길찾기, 블로그 참고도까지 한 번에 확인할 수 있습니다.

---

## 3. 도식화 규칙 및 섹터 격리(색 번짐 방지) 구조

1. **표준 색상 체계**
   - **외부 외벽 (`#layer-outer-wall`)**: 연한 회색 두꺼운 외벽 (`#94a3b8`, `stroke-width: 7.2`)
   - **실내 벽 / 빈 강의실 (`classroom`)**: 얇은 실내 경계선 (`#9aa8ba`) + 연한 파랑 (`#edf4ff`), 평소 호수 비표시(깔끔한 도식도) → 출발/도착/선택 시 진한 파랑(`#7cb9ff`) + 호수/라벨 자동 표시
   - **복도 (`#layer-corridors`)**: 벽이나 방에 막히지 않는 순수 흰색(`#ffffff`) 연속 통로
   - **계단 (`stairs`)**: 초록색(`#bbf7d0` / `#16a34a`) + 디딤판(`#layer-stair-treads`)
   - **화장실**: 남자 찐한 바다파랑(`#0369a1` `♂ 남`), 여자 핑크(`#ec4899` `♀ 여`)
   - **엘리베이터 (`elevator`)**: 보라(`#ede9fe` / `ELV`)
   - **학과사무실/행정(`office`)**, **휴게실(`lounge`)**, **대극장/체육관(`auditorium`)**, **편의시설(`facility`)**, **뚫린공간(`void`, `OPEN`/`ROOF` 빗금)** 구분

2. **절대 다른 방으로 번지지 않는 독립 섹터 구조**
   - 모든 강의실과 시설은 단일 닫힌 `<path class="sector-path">` 로 분리되어 있으며 아래 `data-*` 속성을 가집니다.
   - `id="sector-<sectorId>"`
   - `data-sector-id`: 고유 섹터 ID (예: `"3F_room_308"`)
   - `data-type`: `"classroom" | "office" | "lounge" | "facility" | "auditorium" | "restroom_men" | "restroom_women" | "stairs" | "elevator" | "void"`
   - `data-room-number`: 호수 (예: `"308"`, 없으면 `""`)
   - `data-name`: 전체 명칭
   - `data-corridor-node`: 이 방의 문 앞과 연결된 복도 그래프 노드 ID
   - `data-door-pos`: 실제 출입문 위치 `"x,y"`

---

## 4. 코드에서 바로 사용하는 방법 (JS / TS / Pure SVG)

### 방법 A. 통합 라이브러리 `SuwonBuildingMap` 사용 (권장)

```html
<div id="map-box" style="width:100%;height:600px;"></div>
<script src="./suwon_building_maps/suwonBuildingMap.js"></script>
<script>
  async function initMap() {
    const building = await SuwonBuildingMap.loadBuilding('it_college', './suwon_building_maps');

    const sec308 = SuwonBuildingMap.findSector(building, '308');

    // 1) 특정 층 렌더링 + 특정 호실만 강조(출발/도착 색칠 & 라벨 자동 표시)
    const svg = SuwonBuildingMap.render(document.getElementById('map-box'), building, '3F', {
      startSectorId: sec308.id,
      onSectorClick(sector, floor) {
        console.log('클릭한 섹터:', sector.id, sector.roomNumber, sector.name);
        SuwonBuildingMap.clearHighlights(svg);
        SuwonBuildingMap.colorSector(svg, sector.id, { fill: '#7cb9ff', label: sector.roomNumber || sector.name });
      }
    });

    // 2) 복도만 지나는 다층 최단경로 계산 & 그리기 (예: IT대 308호 -> 203호)
    const route = SuwonBuildingMap.findCorridorRoute(building, '308', '203', { mode: 'stairs' });
    if (route.ok) {
      SuwonBuildingMap.drawRoute(svg, '3F', route);
    }
  }
  initMap();
</script>
```

### 방법 B. 독립 SVG 파일(`floors/*.svg`)만 직접 조작하는 경우

각 `floors/<층>.svg` 파일을 HTML에 인라인 SVG로 넣고 JS나 CSS만으로 제어할 수 있습니다.

```js
// 예: 24_it_college/floors/3F.svg에서 308호만 정확히 파란색으로 물들이기 (주변 방 영향 없음)
const target = svgRoot.querySelector('[data-room-number^="308"]') || svgRoot.querySelector('[data-sector-id*="308"]');
if (target) {
  target.setAttribute('fill', '#7cb9ff');
  target.setAttribute('stroke', '#1d4ed8');
  target.setAttribute('stroke-width', '2.8');
}
```

### `data.json` 핵심 스키마

```jsonc
{
  "buildingId": "it_college",
  "name": "IT대학 (지능형SW융합대학)",
  "floorOrder": ["1F", "2F", "3F", "4F", "5F"],
  "verticalShafts": [
    { "id": "shaft_stairs_1", "type": "stairs", "floors": { "1F": "...", "2F": "...", "3F": "..." } }
  ],
  "floors": {
    "3F": {
      "floor": "3F",
      "viewBox": [0, 0, 1140, 930],
      "shellBoundary": [[[x, y], ...]],
      "corridorPolygons": [[[x, y], ...]],
      "corridorGraph": {
        "nodes": { "3F_c0": { "id": "3F_c0", "x": 195.0, "y": 540.0 } },
        "edges": [{ "from": "3F_c0", "to": "3F_c1", "weight": 82.0 }]
      },
      "sectors": [
        {
          "id": "3F_room_308",
          "type": "classroom",
          "roomNumber": "308",
          "name": "컴퓨터실습실 308",
          "center": [350.2, 610.5],
          "doorPos": [350.0, 560.0],
          "corridorNodeId": "3F_c1",
          "polygon": [[x1, y1], ...]
        }
      ]
    }
  }
}
```

---

## 5. 작업자가 AI와 바로 협업할 때 쓰는 복붙 프롬프트 템플릿

작업자가 `suwon_building_maps/` 폴더를 AI(Cursor, Claude, ChatGPT, Antigravity 등) 에이전트 컨텍스트에 넘긴 뒤, 아래 프롬프트 중 필요한 것을 그대로 붙여넣어 바로 개발할 수 있습니다.

### ① 기존 앱에 실내지도 & 길찾기 UI 붙이기
> `suwon_building_maps/README_AI_GUIDE.md`와 `suwonBuildingMap.js`, `suwonBuildingMap.d.ts`를 읽고 우리 앱에 실내지도 컴포넌트를 연동해 줘.
> 사용자가 건물을 고르고 출발 호실과 도착 호실을 입력하면 `SuwonBuildingMap.loadBuilding()` -> `findCorridorRoute()` -> `render()` 순서로 실행하고, 다층 이동 시 층 전환 탭과 `현재 층`에 해당하는 `polylinesByFloor[floorId]` 경로 및 출발/도착 방 파란색 하이라이트가 표시되게 구현해 줘.

### ② 특정 호실 동적 색칠 (혼잡도·사용중·체크포인트 표시)
> `suwon_building_maps/suwonBuildingMap.js`의 `colorSector()` 및 SVG `[data-sector-id]` 속성을 이용해서, API에서 받은 강의실 상태 목록(사용중=연빨강, 빈강의실=기본 연파랑, 목표강의실=진파랑+라벨표시)대로 각 섹터만 독립적으로 색칠되도록 만들어 줘. 다른 방으로 색이 번지거나 복도를 덮지 않게 `#layer-sectors` 내 대상 path만 수정해 줘.

### ③ 특정 건물의 호실 이름/번호 보완하기 (`references/` 참고도 활용)
> `suwon_building_maps/<건물폴더>/references/` 안의 블로그 평면도 이미지를 보고, 같은 폴더의 `data.json`과 `floors/<층>.svg`에 누락되거나 최근 바뀐 강의실 번호(`roomNumber`)와 이름(`name`, `shortLabel`)을 업데이트해 줘. 특히 `<층>`의 `polygon` 좌표나 `corridorGraph`는 유지하고 메타데이터와 `#layer-labels`만 깔끔하게 맞춰 줘.

### ④ React / Next.js / Flutter WebView 등 프레임워크 래핑
> `suwon_building_maps/suwonBuildingMap.js`와 `catalog.json`을 기반으로 `<IndoorMapViewer buildingId="..." floorId="..." highlightRoom="..." routeStart="..." routeEnd="..." onSelectSector={...} />` React(TypeScript) 컴포넌트를 작성해 줘. 핀치 줌/드래그 패닝을 지원하고, `data.json`이 lazy-load 되게 해 줘.
