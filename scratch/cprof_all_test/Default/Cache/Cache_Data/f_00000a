/**
 * 수원대학교 스마트 캠퍼스 내비게이션 - Step 2 실내 도면 및 다층 그래프 데이터 (IT대학)
 * - 실제 건축 평면도(assets/floorplans/it_floor_1f.png ~ it_floor_5f.png) 좌표계(0~100%) 정밀 매핑
 * - 경사 지형에 따른 다중 출입구별 진입 층수(1F / 2F / 3F) 자동 구분
 * - 다층 다익스트라(Multi-Floor Dijkstra): 엘리베이터 전용 경로 vs 계단 전용 경로 동시 탐색
 */

const IT_COLLEGE_INDOOR_DATA = {
  buildingId: 'it_college',
  buildingName: 'IT대학',
  defaultRoomId: 'room_203',
  defaultEntranceId: 'ent_1f_main',

  // 우측 층수 선택 버튼용 층 목록 (위에서 아래로 5F -> 1F 순서로 렌더링)
  floors: [
    {
      id: '5F',
      label: '5F',
      floorNum: 5,
      title: '5층 (500호대 · 교수연구실/대학원)',
      cadTitle: '건축도면 4층 평면도 (501호~530호)',
      summary: 'IT대학장실(501호) · 학부 교수연구실 · 대학원 공동연구실 · 산학R&D센터',
      image: 'assets/floorplans/it_floor_5f.png',
      pdf: '수원대학교 건물도면/수원대학교 건물도면/24.IT대학/4.pdf',
    },
    {
      id: '4F',
      label: '4F',
      floorNum: 4,
      title: '4층 (400호대 · 전공강의실/SW실습실)',
      cadTitle: '건축도면 3층 평면도 (401호~415호)',
      summary: '운영체제실습실(401호) · 소프트웨어공학실(403호) · 전공강의실(406~409호)',
      image: 'assets/floorplans/it_floor_4f.png',
      pdf: '수원대학교 건물도면/수원대학교 건물도면/24.IT대학/3.pdf',
    },
    {
      id: '3F',
      label: '3F',
      floorNum: 3,
      title: '3층 (300호대 · 서측 언덕 출입구 연결층)',
      cadTitle: '건축도면 2층 평면도 (301호~313호)',
      summary: '서측 언덕 3층 출입구 · 데이터사이언스실(303호) · AI/빅데이터실(306~308호)',
      image: 'assets/floorplans/it_floor_3f.png',
      pdf: '수원대학교 건물도면/수원대학교 건물도면/24.IT대학/2.pdf',
    },
    {
      id: '2F',
      label: '2F',
      floorNum: 2,
      title: '2층 (200호대 · 203호 실습실/중앙 로비층)',
      cadTitle: '건축도면 1층 평면도 (201호~219호)',
      summary: '203호 컴퓨터응용실습실 · 남측 2층 로비 출입구 · 대극장 · 학부사무실(209호)',
      image: 'assets/floorplans/it_floor_2f.png',
      pdf: '수원대학교 건물도면/수원대학교 건물도면/24.IT대학/1.pdf',
    },
    {
      id: '1F',
      label: '1F',
      floorNum: 1,
      title: '1층 (100호대 · 정문/광장 주출입구 진입층)',
      cadTitle: '건축도면 지하1층 평면도 (101호~122호)',
      summary: '남동측 1층 주출입구 · 동측 아트리움 출입구 · 101호 대강의실 · 110호 임베디드실',
      image: 'assets/floorplans/it_floor_1f.png',
      pdf: '수원대학교 건물도면/수원대학교 건물도면/24.IT대학/0.pdf',
    },
  ],

  /**
   * IT대학 다중 출입구 정의 (어느 입구로 들어가느냐에 따라 진입 층수가 달라짐!)
   */
  entrances: [
    {
      id: 'ent_1f_main',
      name: '남동측 정문 주출입구',
      shortName: '남동측 주출입구 (1F 진입)',
      entryFloor: '1F',
      nodeId: 'ent_1f_main',
      lat: 37.21168,
      lng: 126.97652,
      badgeColor: '#0068ff',
      directionHint: '정문 · 인문대 · 체육대 · 대운동장 방면 (1층 진입)',
      description: '정문 광장 및 대운동장(낮은 지대)에서 진입하는 주출입구로, 1층(1F, 100호대 레벨) 로비로 바로 들어갑니다.',
      approachFrom: [
        'main_gate',
        'humanities_college',
        'sports_college',
        'future_innovation',
        'eng_main',
        'advanced_tech_inst',
        'lecture_hall',
        'art_college',
        'sculpture_hall',
      ],
    },
    {
      id: 'ent_1f_east',
      name: '동측 단풍숲 아트리움 출입구',
      shortName: '동측 광장 출입구 (1F 진입)',
      entryFloor: '1F',
      nodeId: 'ent_1f_east',
      lat: 37.21192,
      lng: 126.97665,
      badgeColor: '#0284c7',
      directionHint: '미래혁신관 · 공과대학 · 제1·2공학관 방면 (1층 동문)',
      description: '대운동장·미래혁신관·공과대학 방면 보행로와 연결된 동측 출입구로, 1층(1F) 동측 아트리움 복도로 진입합니다.',
      approachFrom: [
        'future_innovation',
        'eng_main',
        'advanced_tech_inst',
      ],
    },
    {
      id: 'ent_1f_north',
      name: '북측 산책로 보조출입구',
      shortName: '북측 산책로 입구 (1F 진입)',
      entryFloor: '1F',
      nodeId: 'ent_1f_north',
      lat: 37.21216,
      lng: 126.97635,
      badgeColor: '#0d9488',
      directionHint: '글로벌경상관 · 고운기숙사 북측 순환로 방면 (1층 북문)',
      description: '건물 북측 외곽 산책로에서 진입하는 출입구로, 1층(1F) 121호·122호 앞 북측 복도로 진입합니다.',
      approachFrom: [],
    },
    {
      id: 'ent_2f_south',
      name: '남측 중앙계단 로비 출입구',
      shortName: '남측 계단 출입구 (2F 바로 진입)',
      entryFloor: '2F',
      nodeId: 'ent_2f_south',
      lat: 37.21162,
      lng: 126.97625,
      badgeColor: '#7c3aed',
      directionHint: '후문 · 중앙도서관 · 학생회관 · 자연과학대 방면 (2층 직결)',
      description: '후문 및 중앙도서관 학술로를 통해 진입하는 출입구로, 들어서는 순간 2층(2F, 203호가 있는 200호대 층) 로비입니다.',
      approachFrom: [
        'back_gate',
        'central_library',
        'student_union',
        'science_college',
        'eng_building_1',
        'eng_building_2',
        'main_building',
        'global_talent',
      ],
    },
    {
      id: 'ent_3f_west',
      name: '서측 언덕 경사로 출입구',
      shortName: '서측 언덕 출입구 (3F 바로 진입)',
      entryFloor: '3F',
      nodeId: 'ent_3f_west',
      lat: 37.21188,
      lng: 126.97578,
      badgeColor: '#ea580c',
      directionHint: '글로벌경상관 CU 쪽문 · 음악대 · 법정대 서측 언덕 방면 (3층 직결)',
      description: '높은 서측 언덕길과 연결된 출입구로, 경사 지형 때문에 이 입구로 들어가면 3층(3F, 300호대 층)으로 바로 진입합니다.',
      approachFrom: [
        'west_gate_cu',
        'global_business',
        'dormitory',
        'music_college',
        'law_college',
        'amaranth_hall',
      ],
    },
  ],

  /**
   * 전체 층 노드 데이터 (x, y는 평면도 이미지 내 0~100% 상대 좌표)
   * type: 'entrance' | 'elevator' | 'stairs' | 'restroom' | 'classroom' | 'corridor'
   */
  nodes: {
    // =========================================================================
    // [1F] 1층 (100호대 · 정문/광장 진입층, 도면 0.pdf)
    // =========================================================================
    ent_1f_main: {
      id: 'ent_1f_main',
      floor: '1F',
      type: 'entrance',
      name: '남동측 1층 주출입구',
      shortLabel: '🚪 1F 남동측 주출입구',
      x: 83.5,
      y: 66.5,
    },
    ent_1f_east: {
      id: 'ent_1f_east',
      floor: '1F',
      type: 'entrance',
      name: '동측 1층 아트리움 출입구',
      shortLabel: '🚪 1F 동측 출입구',
      x: 85.5,
      y: 36.5,
    },
    ent_1f_north: {
      id: 'ent_1f_north',
      floor: '1F',
      type: 'entrance',
      name: '북측 1층 산책로 출입구',
      shortLabel: '🚪 1F 북측 출입구',
      x: 63.8,
      y: 12.0,
    },

    elv_east_1F: {
      id: 'elv_east_1F',
      floor: '1F',
      type: 'elevator',
      shaftId: 'elv_east',
      name: '동측 엘리베이터 (1층)',
      shortLabel: '🛗 엘리베이터',
      x: 70.2,
      y: 78.5,
    },
    stair_east_1F: {
      id: 'stair_east_1F',
      floor: '1F',
      type: 'stairs',
      shaftId: 'stair_east',
      name: '동측 주계단 (1층)',
      shortLabel: '🪜 계단',
      x: 67.5,
      y: 56.0,
    },
    elv_west_1F: {
      id: 'elv_west_1F',
      floor: '1F',
      type: 'elevator',
      shaftId: 'elv_west',
      name: '서측 엘리베이터 (1층)',
      shortLabel: '🛗 서측 엘리베이터',
      x: 11.5,
      y: 59.8,
    },
    stair_west_1F: {
      id: 'stair_west_1F',
      floor: '1F',
      type: 'stairs',
      shaftId: 'stair_west',
      name: '서측 비상계단 (1층)',
      shortLabel: '🪜 서측 계단',
      x: 6.5,
      y: 61.5,
    },

    wc_women_1F: {
      id: 'wc_women_1F',
      floor: '1F',
      type: 'restroom',
      name: '1층 여자화장실',
      shortLabel: '🚻 여자화장실',
      x: 53.5,
      y: 73.2,
    },
    wc_men_1F: {
      id: 'wc_men_1F',
      floor: '1F',
      type: 'restroom',
      name: '1층 남자화장실',
      shortLabel: '🚻 남자화장실',
      x: 62.2,
      y: 73.2,
    },

    // 1F 복도 교차로 노드
    c1_se_entry: { id: 'c1_se_entry', floor: '1F', type: 'corridor', name: '1층 남동측 입구 홀', x: 77.5, y: 66.5 },
    c1_elv_east: { id: 'c1_elv_east', floor: '1F', type: 'corridor', name: '1층 동측 엘리베이터 앞', x: 70.2, y: 71.5 },
    c1_e_junction: { id: 'c1_e_junction', floor: '1F', type: 'corridor', name: '1층 동측 복도 교차로', x: 68.0, y: 66.5 },
    c1_e_stair_front: { id: 'c1_e_stair_front', floor: '1F', type: 'corridor', name: '1층 동측 계단 앞', x: 68.0, y: 56.0 },
    c1_e_atrium: { id: 'c1_e_atrium', floor: '1F', type: 'corridor', name: '1층 동측 아트리움 홀', x: 68.0, y: 36.5 },
    c1_e_door: { id: 'c1_e_door', floor: '1F', type: 'corridor', name: '1층 동측 출입구 통로', x: 77.5, y: 36.5 },
    c1_e_north1: { id: 'c1_e_north1', floor: '1F', type: 'corridor', name: '1층 북동측 복도 (119호 앞)', x: 68.0, y: 24.5 },
    c1_e_north2: { id: 'c1_e_north2', floor: '1F', type: 'corridor', name: '1층 북동측 복도 (120호 앞)', x: 68.0, y: 19.5 },
    c1_n_entry: { id: 'c1_n_entry', floor: '1F', type: 'corridor', name: '1층 북측 출입구 홀', x: 68.0, y: 12.0 },
    c1_s_east: { id: 'c1_s_east', floor: '1F', type: 'corridor', name: '1층 남측 복도 (남자화장실 앞)', x: 62.2, y: 67.2 },
    c1_s_mid2: { id: 'c1_s_mid2', floor: '1F', type: 'corridor', name: '1층 남측 복도 (여자화장실 앞)', x: 53.5, y: 66.8 },
    c1_s_center: { id: 'c1_s_center', floor: '1F', type: 'corridor', name: '1층 중앙 복도', x: 41.5, y: 66.2 },
    c1_s_mid1: { id: 'c1_s_mid1', floor: '1F', type: 'corridor', name: '1층 서측 복도 (109·117호 앞)', x: 31.0, y: 65.5 },
    c1_s_west: { id: 'c1_s_west', floor: '1F', type: 'corridor', name: '1층 서측 복도 (110·116호 앞)', x: 23.5, y: 64.8 },
    c1_w_lobby: { id: 'c1_w_lobby', floor: '1F', type: 'corridor', name: '1층 서측 엘리베이터 홀', x: 16.0, y: 64.0 },
    c1_w_stair: { id: 'c1_w_stair', floor: '1F', type: 'corridor', name: '1층 서측 계단 홀', x: 9.5, y: 64.0 },

    // 1F 강의실 노드
    room_101: {
      id: 'room_101',
      floor: '1F',
      type: 'classroom',
      roomNumber: '101호',
      name: '101호 (원형 계단강의실)',
      dept: 'IT대학 공통 · 대형강의실',
      shortLabel: '101호',
      aliases: ['IT대학 101호', '101호', '원형강의실', '계단강의실'],
      x: 77.8,
      y: 51.5,
    },
    room_105: {
      id: 'room_105',
      floor: '1F',
      type: 'classroom',
      roomNumber: '대극장',
      name: '대극장 (IT대학 컨퍼런스홀)',
      dept: 'IT대학 중앙 대극장',
      shortLabel: '대극장',
      aliases: ['IT대학 대극장', '대극장', '105호'],
      x: 48.5,
      y: 36.8,
    },
    room_109: {
      id: 'room_109',
      floor: '1F',
      type: 'classroom',
      roomNumber: '109호',
      name: '109호 (네트워크·서버실습실)',
      dept: '정보통신학부',
      shortLabel: '109호',
      aliases: ['IT대학 109호', '109호', '네트워크실습실'],
      x: 25.0,
      y: 82.5,
    },
    room_110: {
      id: 'room_110',
      floor: '1F',
      type: 'classroom',
      roomNumber: '110호',
      name: '110호 (임베디드시스템실습실)',
      dept: '컴퓨터학부',
      shortLabel: '110호',
      aliases: ['IT대학 110호', '110호', '임베디드실습실'],
      x: 20.5,
      y: 69.8,
    },
    room_115: {
      id: 'room_115',
      floor: '1F',
      type: 'classroom',
      roomNumber: '115호',
      name: '115호 (IT대학 학생회실)',
      dept: '학생자치공간',
      shortLabel: '115호',
      aliases: ['IT대학 115호', '115호', '학생회실'],
      x: 19.2,
      y: 61.2,
    },
    room_116: {
      id: 'room_116',
      floor: '1F',
      type: 'classroom',
      roomNumber: '116호',
      name: '116호 (실습장비지원실)',
      dept: 'IT대학 행정지원',
      shortLabel: '116호',
      aliases: ['IT대학 116호', '116호'],
      x: 25.2,
      y: 61.5,
    },
    room_117: {
      id: 'room_117',
      floor: '1F',
      type: 'classroom',
      roomNumber: '117호',
      name: '117호 (전산소모품실)',
      dept: 'IT대학 행정지원',
      shortLabel: '117호',
      aliases: ['IT대학 117호', '117호'],
      x: 30.8,
      y: 61.8,
    },
    room_118: {
      id: 'room_118',
      floor: '1F',
      type: 'classroom',
      roomNumber: '118호',
      name: '118호 (기초프로그래밍실)',
      dept: '컴퓨터학부',
      shortLabel: '118호',
      aliases: ['IT대학 118호', '118호'],
      x: 37.2,
      y: 61.8,
    },
    room_119: {
      id: 'room_119',
      floor: '1F',
      type: 'classroom',
      roomNumber: '119호',
      name: '119호 (인공지능기초실습실)',
      dept: 'AI융합학부',
      shortLabel: '119호',
      aliases: ['IT대학 119호', '119호'],
      x: 82.5,
      y: 24.5,
    },
    room_120: {
      id: 'room_120',
      floor: '1F',
      type: 'classroom',
      roomNumber: '120호',
      name: '120호 (디지털논리회로실)',
      dept: '정보통신학부',
      shortLabel: '120호',
      aliases: ['IT대학 120호', '120호'],
      x: 74.0,
      y: 19.5,
    },
    room_121: {
      id: 'room_121',
      floor: '1F',
      type: 'classroom',
      roomNumber: '121호',
      name: '121호 (오픈소스SW실습실)',
      dept: '컴퓨터학부',
      shortLabel: '121호',
      aliases: ['IT대학 121호', '121호'],
      x: 74.0,
      y: 11.5,
    },
    room_122: {
      id: 'room_122',
      floor: '1F',
      type: 'classroom',
      roomNumber: '122호',
      name: '122호 (캡스톤디자인실)',
      dept: 'IT대학 공통',
      shortLabel: '122호',
      aliases: ['IT대학 122호', '122호', '캡스톤디자인실'],
      x: 80.2,
      y: 7.5,
    },

    // =========================================================================
    // [2F] 2층 (200호대 · 203호가 위치한 핵심 층, 도면 1.pdf)
    // =========================================================================
    ent_2f_south: {
      id: 'ent_2f_south',
      floor: '2F',
      type: 'entrance',
      name: '남측 2층 중앙계단 출입구',
      shortLabel: '🚪 2F 남측 중앙출입구',
      x: 62.2,
      y: 89.5,
    },
    ent_2f_east: {
      id: 'ent_2f_east',
      floor: '2F',
      type: 'entrance',
      name: '동측 2층 테라스 출입구',
      shortLabel: '🚪 2F 동측 출입구',
      x: 83.2,
      y: 67.5,
    },

    elv_east_2F: {
      id: 'elv_east_2F',
      floor: '2F',
      type: 'elevator',
      shaftId: 'elv_east',
      name: '동측 엘리베이터 (2층)',
      shortLabel: '🛗 엘리베이터',
      x: 70.2,
      y: 78.5,
    },
    stair_east_2F: {
      id: 'stair_east_2F',
      floor: '2F',
      type: 'stairs',
      shaftId: 'stair_east',
      name: '동측 주계단 (2층)',
      shortLabel: '🪜 계단',
      x: 67.5,
      y: 56.0,
    },
    elv_west_2F: {
      id: 'elv_west_2F',
      floor: '2F',
      type: 'elevator',
      shaftId: 'elv_west',
      name: '서측 엘리베이터 (2층)',
      shortLabel: '🛗 서측 엘리베이터',
      x: 11.5,
      y: 59.8,
    },
    stair_west_2F: {
      id: 'stair_west_2F',
      floor: '2F',
      type: 'stairs',
      shaftId: 'stair_west',
      name: '서측 비상계단 (2층)',
      shortLabel: '🪜 서측 계단',
      x: 6.5,
      y: 61.5,
    },

    wc_women_2F: {
      id: 'wc_women_2F',
      floor: '2F',
      type: 'restroom',
      name: '2층 여자화장실',
      shortLabel: '🚻 여자화장실',
      x: 52.2,
      y: 13.8,
    },
    wc_men_2F: {
      id: 'wc_men_2F',
      floor: '2F',
      type: 'restroom',
      name: '2층 남자화장실',
      shortLabel: '🚻 남자화장실',
      x: 56.8,
      y: 13.2,
    },

    // 2F 복도 교차로 노드
    c2_s_vestibule: { id: 'c2_s_vestibule', floor: '2F', type: 'corridor', name: '2층 남측 방풍실', x: 62.2, y: 82.0 },
    c2_s_lobby: { id: 'c2_s_lobby', floor: '2F', type: 'corridor', name: '2층 남측 중앙로비', x: 62.2, y: 74.0 },
    c2_elv_east: { id: 'c2_elv_east', floor: '2F', type: 'corridor', name: '2층 동측 엘리베이터 앞', x: 70.2, y: 74.0 },
    c2_201_front: { id: 'c2_201_front', floor: '2F', type: 'corridor', name: '201호 앞 복도', x: 75.5, y: 74.0 },
    c2_e_junction: { id: 'c2_e_junction', floor: '2F', type: 'corridor', name: '2층 동측 복도 분기점', x: 71.2, y: 67.5 },
    c2_e_stair_front: { id: 'c2_e_stair_front', floor: '2F', type: 'corridor', name: '2층 동측 계단 앞', x: 71.2, y: 56.0 },
    c2_e_213: { id: 'c2_e_213', floor: '2F', type: 'corridor', name: '213호 앞 복도', x: 71.2, y: 51.5 },
    c2_e_214: { id: 'c2_e_214', floor: '2F', type: 'corridor', name: '214호 앞 복도', x: 71.2, y: 36.8 },
    c2_e_215: { id: 'c2_e_215', floor: '2F', type: 'corridor', name: '215호 앞 복도', x: 71.2, y: 26.8 },
    c2_e_216: { id: 'c2_e_216', floor: '2F', type: 'corridor', name: '216호 앞 복도', x: 71.2, y: 17.0 },
    c2_e_north: { id: 'c2_e_north', floor: '2F', type: 'corridor', name: '2층 북동측 복도 (217~219호 앞)', x: 71.2, y: 11.2 },
    c2_n_wc: { id: 'c2_n_wc', floor: '2F', type: 'corridor', name: '2층 북측 화장실 앞 복도', x: 56.0, y: 15.5 },

    c2_203_front: { id: 'c2_203_front', floor: '2F', type: 'corridor', name: '203호 강의실 문 앞', x: 52.5, y: 76.5 },
    c2_204_front: { id: 'c2_204_front', floor: '2F', type: 'corridor', name: '204호·211호 앞 복도', x: 45.8, y: 76.5 },
    c2_205_front: { id: 'c2_205_front', floor: '2F', type: 'corridor', name: '205호·210호 앞 복도', x: 38.2, y: 76.5 },
    c2_206_front: { id: 'c2_206_front', floor: '2F', type: 'corridor', name: '206호·209호 앞 복도', x: 29.8, y: 76.5 },
    c2_207_front: { id: 'c2_207_front', floor: '2F', type: 'corridor', name: '207호 앞 복도', x: 20.8, y: 76.5 },
    c2_sw_corner: { id: 'c2_sw_corner', floor: '2F', type: 'corridor', name: '2층 남서측 복도 코너 (208호 앞)', x: 16.5, y: 76.5 },
    c2_w_mid: { id: 'c2_w_mid', floor: '2F', type: 'corridor', name: '2층 서측 계단 연결 복도', x: 16.5, y: 64.5 },
    c2_w_stair: { id: 'c2_w_stair', floor: '2F', type: 'corridor', name: '2층 서측 계단 앞', x: 9.5, y: 64.5 },
    c2_w_elv: { id: 'c2_w_elv', floor: '2F', type: 'corridor', name: '2층 서측 엘리베이터 앞', x: 16.5, y: 59.8 },
    c2_w_212: { id: 'c2_w_212', floor: '2F', type: 'corridor', name: '212호 앞 복도', x: 16.5, y: 44.0 },

    // 2F 강의실 노드 (★ 203호 포함!)
    room_201: {
      id: 'room_201',
      floor: '2F',
      type: 'classroom',
      roomNumber: '201호',
      name: '201호 (IT도서실·열람실)',
      dept: 'IT대학 학습지원',
      shortLabel: '201호',
      aliases: ['IT대학 201호', '201호', 'IT도서실'],
      x: 78.5,
      y: 84.8,
    },
    room_203: {
      id: 'room_203',
      floor: '2F',
      type: 'classroom',
      roomNumber: '203호',
      name: '203호 (컴퓨터응용·SW실습실)',
      dept: '컴퓨터학부 · 소프트웨어전공 핵심 실습실',
      shortLabel: '203호 ★',
      isFeatured: true,
      aliases: ['IT대학 203호', '203호', 'IT 203호', '컴퓨터응용실습실', 'it대학 203호', '203'],
      x: 52.5,
      y: 84.8,
    },
    room_204: {
      id: 'room_204',
      floor: '2F',
      type: 'classroom',
      roomNumber: '204호',
      name: '204호 (프로그래밍실습실 1)',
      dept: '컴퓨터학부',
      shortLabel: '204호',
      aliases: ['IT대학 204호', '204호'],
      x: 45.8,
      y: 84.8,
    },
    room_205: {
      id: 'room_205',
      floor: '2F',
      type: 'classroom',
      roomNumber: '205호',
      name: '205호 (지능형네트워크실습실)',
      dept: '정보통신학부',
      shortLabel: '205호',
      aliases: ['IT대학 205호', '205호'],
      x: 38.2,
      y: 84.8,
    },
    room_206: {
      id: 'room_206',
      floor: '2F',
      type: 'classroom',
      roomNumber: '206호',
      name: '206호 (보안관제·해킹방어실습실)',
      dept: '정보보호학과',
      shortLabel: '206호',
      aliases: ['IT대학 206호', '206호'],
      x: 29.8,
      y: 84.8,
    },
    room_207: {
      id: 'room_207',
      floor: '2F',
      type: 'classroom',
      roomNumber: '207호',
      name: '207호 (정보통신학부 전공강의실)',
      dept: '정보통신학부',
      shortLabel: '207호',
      aliases: ['IT대학 207호', '207호'],
      x: 20.8,
      y: 84.8,
    },
    room_208: {
      id: 'room_208',
      floor: '2F',
      type: 'classroom',
      roomNumber: '208호',
      name: '208호 (마이크로프로세서실습실)',
      dept: '정보통신학부',
      shortLabel: '208호',
      aliases: ['IT대학 208호', '208호'],
      x: 12.2,
      y: 82.5,
    },
    room_209: {
      id: 'room_209',
      floor: '2F',
      type: 'classroom',
      roomNumber: '209호',
      name: '209호 (IT대학 통합교학팀·행정실)',
      dept: 'IT대학 행정실',
      shortLabel: '209호 행정실',
      aliases: ['IT대학 209호', '209호', 'IT대학 행정실', '교학팀', '학과사무실'],
      x: 27.5,
      y: 72.0,
    },
    room_210: {
      id: 'room_210',
      floor: '2F',
      type: 'classroom',
      roomNumber: '210호',
      name: '210호 (전산서버·클라우드운영실)',
      dept: 'IT대학 인프라',
      shortLabel: '210호',
      aliases: ['IT대학 210호', '210호'],
      x: 39.8,
      y: 73.2,
    },
    room_211: {
      id: 'room_211',
      floor: '2F',
      type: 'classroom',
      roomNumber: '211호',
      name: '211호 (SW중심대학 프로젝트실)',
      dept: '컴퓨터학부',
      shortLabel: '211호',
      aliases: ['IT대학 211호', '211호'],
      x: 47.8,
      y: 73.2,
    },
    room_212: {
      id: 'room_212',
      floor: '2F',
      type: 'classroom',
      roomNumber: '212호',
      name: '212호 (전자회로·통신실험실)',
      dept: '정보통신학부',
      shortLabel: '212호',
      aliases: ['IT대학 212호', '212호'],
      x: 12.2,
      y: 44.0,
    },
    room_213: {
      id: 'room_213',
      floor: '2F',
      type: 'classroom',
      roomNumber: '213호',
      name: '213호 (계단식 전공대강의실)',
      dept: 'IT대학 공통',
      shortLabel: '213호',
      aliases: ['IT대학 213호', '213호'],
      x: 78.5,
      y: 51.5,
    },
    room_214: {
      id: 'room_214',
      floor: '2F',
      type: 'classroom',
      roomNumber: '214호',
      name: '214호 (멀티미디어컴퓨팅실)',
      dept: '미디어SW학과',
      shortLabel: '214호',
      aliases: ['IT대학 214호', '214호'],
      x: 78.5,
      y: 36.8,
    },
    room_215: {
      id: 'room_215',
      floor: '2F',
      type: 'classroom',
      roomNumber: '215호',
      name: '215호 (데이터베이스실습실)',
      dept: '컴퓨터학부',
      shortLabel: '215호',
      aliases: ['IT대학 215호', '215호'],
      x: 78.5,
      y: 26.8,
    },
    room_216: {
      id: 'room_216',
      floor: '2F',
      type: 'classroom',
      roomNumber: '216호',
      name: '216호 (컴퓨터그래픽스실습실)',
      dept: '미디어SW학과',
      shortLabel: '216호',
      aliases: ['IT대학 216호', '216호'],
      x: 78.5,
      y: 17.0,
    },
    room_217: {
      id: 'room_217',
      floor: '2F',
      type: 'classroom',
      roomNumber: '217호',
      name: '217호 (학부세미나실 A)',
      dept: 'IT대학 공통',
      shortLabel: '217호',
      aliases: ['IT대학 217호', '217호'],
      x: 80.2,
      y: 7.5,
    },
    room_218: {
      id: 'room_218',
      floor: '2F',
      type: 'classroom',
      roomNumber: '218호',
      name: '218호 (학부세미나실 B)',
      dept: 'IT대학 공통',
      shortLabel: '218호',
      aliases: ['IT대학 218호', '218호'],
      x: 74.8,
      y: 8.0,
    },
    room_219: {
      id: 'room_219',
      floor: '2F',
      type: 'classroom',
      roomNumber: '219호',
      name: '219호 (학생상담·멘토링실)',
      dept: 'IT대학 공통',
      shortLabel: '219호',
      aliases: ['IT대학 219호', '219호'],
      x: 68.5,
      y: 9.8,
    },

    // =========================================================================
    // [3F] 3층 (300호대 · 서측 언덕 출입구 연결층, 도면 2.pdf)
    // =========================================================================
    ent_3f_west: {
      id: 'ent_3f_west',
      floor: '3F',
      type: 'entrance',
      name: '서측 언덕 3층 출입구',
      shortLabel: '🚪 3F 서측 언덕출입구',
      x: 6.2,
      y: 73.5,
    },

    elv_east_3F: {
      id: 'elv_east_3F',
      floor: '3F',
      type: 'elevator',
      shaftId: 'elv_east',
      name: '동측 엘리베이터 (3층)',
      shortLabel: '🛗 엘리베이터',
      x: 70.2,
      y: 78.5,
    },
    stair_east_3F: {
      id: 'stair_east_3F',
      floor: '3F',
      type: 'stairs',
      shaftId: 'stair_east',
      name: '동측 주계단 (3층)',
      shortLabel: '🪜 계단',
      x: 73.5,
      y: 78.8,
    },
    elv_west_3F: {
      id: 'elv_west_3F',
      floor: '3F',
      type: 'elevator',
      shaftId: 'elv_west',
      name: '서측 엘리베이터 (3층)',
      shortLabel: '🛗 서측 엘리베이터',
      x: 11.5,
      y: 59.8,
    },
    stair_west_3F: {
      id: 'stair_west_3F',
      floor: '3F',
      type: 'stairs',
      shaftId: 'stair_west',
      name: '서측 비상계단 (3층)',
      shortLabel: '🪜 서측 계단',
      x: 6.5,
      y: 61.5,
    },

    // 3F 복도 교차로 노드
    c3_w_elv: { id: 'c3_w_elv', floor: '3F', type: 'corridor', name: '3층 서측 엘리베이터 앞', x: 15.5, y: 59.8 },
    c3_w_stair: { id: 'c3_w_stair', floor: '3F', type: 'corridor', name: '3층 서측 계단 앞', x: 9.5, y: 64.5 },
    c3_w_mid: { id: 'c3_w_mid', floor: '3F', type: 'corridor', name: '3층 서측 복도', x: 15.5, y: 64.5 },
    c3_w_entry: { id: 'c3_w_entry', floor: '3F', type: 'corridor', name: '3층 서측 언덕출입구 홀', x: 15.5, y: 73.5 },
    c3_w_311: { id: 'c3_w_311', floor: '3F', type: 'corridor', name: '311호 앞 복도', x: 15.5, y: 44.0 },
    c3_sw_corner: { id: 'c3_sw_corner', floor: '3F', type: 'corridor', name: '310호 앞 코너', x: 15.5, y: 79.5 },
    c3_s_309: { id: 'c3_s_309', floor: '3F', type: 'corridor', name: '309호 앞 복도', x: 20.8, y: 79.5 },
    c3_s_308: { id: 'c3_s_308', floor: '3F', type: 'corridor', name: '308호 앞 복도', x: 29.0, y: 79.5 },
    c3_s_307: { id: 'c3_s_307', floor: '3F', type: 'corridor', name: '307호 앞 복도', x: 37.5, y: 79.5 },
    c3_s_306: { id: 'c3_s_306', floor: '3F', type: 'corridor', name: '306호 앞 복도', x: 45.5, y: 79.5 },
    c3_s_304: { id: 'c3_s_304', floor: '3F', type: 'corridor', name: '304·305호 앞 복도', x: 53.5, y: 83.8 },
    c3_se_hall: { id: 'c3_se_hall', floor: '3F', type: 'corridor', name: '3층 동측 복도 홀', x: 67.5, y: 83.8 },
    c3_elv_east: { id: 'c3_elv_east', floor: '3F', type: 'corridor', name: '3층 동측 엘리베이터 앞', x: 67.5, y: 74.5 },
    c3_stair_east: { id: 'c3_stair_east', floor: '3F', type: 'corridor', name: '3층 동측 계단 앞', x: 73.5, y: 83.8 },
    c3_303: { id: 'c3_303', floor: '3F', type: 'corridor', name: '303호 앞 복도', x: 70.5, y: 83.8 },
    c3_302: { id: 'c3_302', floor: '3F', type: 'corridor', name: '302·312호 앞 복도', x: 78.5, y: 83.8 },
    c3_301: { id: 'c3_301', floor: '3F', type: 'corridor', name: '301·313호 앞 복도', x: 88.5, y: 83.8 },

    // 3F 강의실 노드
    room_301: {
      id: 'room_301',
      floor: '3F',
      type: 'classroom',
      roomNumber: '301호',
      name: '301호 (클라우드컴퓨팅실습실)',
      dept: '컴퓨터학부',
      shortLabel: '301호',
      aliases: ['IT대학 301호', '301호'],
      x: 88.5,
      y: 88.0,
    },
    room_302: {
      id: 'room_302',
      floor: '3F',
      type: 'classroom',
      roomNumber: '302호',
      name: '302호 (정보보안암호실습실)',
      dept: '정보보호학과',
      shortLabel: '302호',
      aliases: ['IT대학 302호', '302호'],
      x: 78.5,
      y: 88.0,
    },
    room_303: {
      id: 'room_303',
      floor: '3F',
      type: 'classroom',
      roomNumber: '303호',
      name: '303호 (데이터사이언스실습실)',
      dept: '데이터과학부',
      shortLabel: '303호',
      aliases: ['IT대학 303호', '303호', '데이터사이언스실습실'],
      x: 70.5,
      y: 88.0,
    },
    room_304: {
      id: 'room_304',
      floor: '3F',
      type: 'classroom',
      roomNumber: '304호',
      name: '304호 (모바일앱개발실습실)',
      dept: '컴퓨터학부',
      shortLabel: '304호',
      aliases: ['IT대학 304호', '304호'],
      x: 53.5,
      y: 88.0,
    },
    room_305: {
      id: 'room_305',
      floor: '3F',
      type: 'classroom',
      roomNumber: '305호',
      name: '305호 (네트워크보안실습실)',
      dept: '정보보호학과',
      shortLabel: '305호',
      aliases: ['IT대학 305호', '305호'],
      x: 52.8,
      y: 81.5,
    },
    room_306: {
      id: 'room_306',
      floor: '3F',
      type: 'classroom',
      roomNumber: '306호',
      name: '306호 (빅데이터분석실습실)',
      dept: '데이터과학부',
      shortLabel: '306호',
      aliases: ['IT대학 306호', '306호', '빅데이터실습실'],
      x: 45.5,
      y: 84.5,
    },
    room_307: {
      id: 'room_307',
      floor: '3F',
      type: 'classroom',
      roomNumber: '307호',
      name: '307호 (인공지능심화실습실)',
      dept: 'AI융합학부',
      shortLabel: '307호',
      aliases: ['IT대학 307호', '307호'],
      x: 37.5,
      y: 84.5,
    },
    room_308: {
      id: 'room_308',
      floor: '3F',
      type: 'classroom',
      roomNumber: '308호',
      name: '308호 (사물인터넷·IoT실습실)',
      dept: '정보통신학부',
      shortLabel: '308호',
      aliases: ['IT대학 308호', '308호', 'IoT실습실'],
      x: 29.0,
      y: 84.5,
    },
    room_309: {
      id: 'room_309',
      floor: '3F',
      type: 'classroom',
      roomNumber: '309호',
      name: '309호 (컴퓨터구조강의실)',
      dept: '컴퓨터학부',
      shortLabel: '309호',
      aliases: ['IT대학 309호', '309호'],
      x: 20.8,
      y: 85.5,
    },
    room_310: {
      id: 'room_310',
      floor: '3F',
      type: 'classroom',
      roomNumber: '310호',
      name: '310호 (디지털미디어실습실)',
      dept: '미디어SW학과',
      shortLabel: '310호',
      aliases: ['IT대학 310호', '310호'],
      x: 11.0,
      y: 85.5,
    },
    room_311: {
      id: 'room_311',
      floor: '3F',
      type: 'classroom',
      roomNumber: '311호',
      name: '311호 (가상현실·게임엔진실습실)',
      dept: '미디어SW학과',
      shortLabel: '311호',
      aliases: ['IT대학 311호', '311호', 'VR실습실'],
      x: 12.2,
      y: 44.0,
    },
    room_312: {
      id: 'room_312',
      floor: '3F',
      type: 'classroom',
      roomNumber: '312-B호',
      name: '312-B호 (학과세미나실)',
      dept: 'IT대학 공통',
      shortLabel: '312-B호',
      aliases: ['IT대학 312호', '312호', '312-B호'],
      x: 78.5,
      y: 78.0,
    },
    room_313: {
      id: 'room_313',
      floor: '3F',
      type: 'classroom',
      roomNumber: '313호',
      name: '313호 (산학협력프로젝트실)',
      dept: 'IT대학 공통',
      shortLabel: '313호',
      aliases: ['IT대학 313호', '313호'],
      x: 88.5,
      y: 78.0,
    },

    // =========================================================================
    // [4F] 4층 (400호대 · 전공강의실/실습실, 도면 3.pdf)
    // =========================================================================
    elv_east_4F: {
      id: 'elv_east_4F',
      floor: '4F',
      type: 'elevator',
      shaftId: 'elv_east',
      name: '동측 엘리베이터 (4층)',
      shortLabel: '🛗 엘리베이터',
      x: 70.2,
      y: 78.5,
    },
    stair_east_4F: {
      id: 'stair_east_4F',
      floor: '4F',
      type: 'stairs',
      shaftId: 'stair_east',
      name: '동측 주계단 (4층)',
      shortLabel: '🪜 계단',
      x: 73.5,
      y: 78.8,
    },
    elv_west_4F: {
      id: 'elv_west_4F',
      floor: '4F',
      type: 'elevator',
      shaftId: 'elv_west',
      name: '서측 엘리베이터 (4층)',
      shortLabel: '🛗 서측 엘리베이터',
      x: 11.5,
      y: 59.8,
    },
    stair_west_4F: {
      id: 'stair_west_4F',
      floor: '4F',
      type: 'stairs',
      shaftId: 'stair_west',
      name: '서측 비상계단 (4층)',
      shortLabel: '🪜 서측 계단',
      x: 6.5,
      y: 61.5,
    },
    wc_women_4F: {
      id: 'wc_women_4F',
      floor: '4F',
      type: 'restroom',
      name: '4층 여자화장실',
      shortLabel: '🚻 여자화장실',
      x: 45.8,
      y: 73.5,
    },
    wc_men_4F: {
      id: 'wc_men_4F',
      floor: '4F',
      type: 'restroom',
      name: '4층 남자화장실',
      shortLabel: '🚻 남자화장실',
      x: 55.2,
      y: 76.5,
    },

    // 4F 복도 교차로 노드
    c4_w_elv: { id: 'c4_w_elv', floor: '4F', type: 'corridor', name: '4층 서측 엘리베이터 앞', x: 16.5, y: 59.8 },
    c4_w_stair: { id: 'c4_w_stair', floor: '4F', type: 'corridor', name: '4층 서측 계단 앞', x: 9.5, y: 64.5 },
    c4_w_mid: { id: 'c4_w_mid', floor: '4F', type: 'corridor', name: '410호 앞 서측 복도', x: 16.5, y: 66.5 },
    c4_sw_corner: { id: 'c4_sw_corner', floor: '4F', type: 'corridor', name: '409-2호 앞 코너', x: 16.5, y: 77.0 },
    c4_409: { id: 'c4_409', floor: '4F', type: 'corridor', name: '409호 앞 복도', x: 20.8, y: 77.0 },
    c4_408: { id: 'c4_408', floor: '4F', type: 'corridor', name: '408·411호 앞 복도', x: 29.0, y: 77.0 },
    c4_407: { id: 'c4_407', floor: '4F', type: 'corridor', name: '407·412호 앞 복도', x: 37.5, y: 77.0 },
    c4_406: { id: 'c4_406', floor: '4F', type: 'corridor', name: '406호·화장실 앞 복도', x: 45.8, y: 77.0 },
    c4_mid_drop: { id: 'c4_mid_drop', floor: '4F', type: 'corridor', name: '405호 앞 복도', x: 51.5, y: 83.8 },
    c4_404: { id: 'c4_404', floor: '4F', type: 'corridor', name: '404-2·413호 앞 복도', x: 61.5, y: 83.8 },
    c4_elv_east: { id: 'c4_elv_east', floor: '4F', type: 'corridor', name: '4층 동측 엘리베이터 앞', x: 67.5, y: 83.8 },
    c4_stair_east: { id: 'c4_stair_east', floor: '4F', type: 'corridor', name: '4층 동측 계단 앞', x: 73.5, y: 83.8 },
    c4_403: { id: 'c4_403', floor: '4F', type: 'corridor', name: '403호 앞 복도', x: 70.5, y: 83.8 },
    c4_402: { id: 'c4_402', floor: '4F', type: 'corridor', name: '402·414호 앞 복도', x: 78.5, y: 83.8 },
    c4_401: { id: 'c4_401', floor: '4F', type: 'corridor', name: '401·415호 앞 복도', x: 88.5, y: 83.8 },

    // 4F 강의실 노드
    room_401: {
      id: 'room_401',
      floor: '4F',
      type: 'classroom',
      roomNumber: '401호',
      name: '401호 (운영체제·리눅스실습실)',
      dept: '컴퓨터학부',
      shortLabel: '401호',
      aliases: ['IT대학 401호', '401호', '운영체제실습실'],
      x: 88.5,
      y: 88.0,
    },
    room_402: {
      id: 'room_402',
      floor: '4F',
      type: 'classroom',
      roomNumber: '402호',
      name: '402호 (알고리즘설계강의실)',
      dept: '컴퓨터학부',
      shortLabel: '402호',
      aliases: ['IT대학 402호', '402호'],
      x: 78.5,
      y: 88.0,
    },
    room_403: {
      id: 'room_403',
      floor: '4F',
      type: 'classroom',
      roomNumber: '403호',
      name: '403호 (소프트웨어공학실습실)',
      dept: '컴퓨터학부',
      shortLabel: '403호',
      aliases: ['IT대학 403호', '403호'],
      x: 70.5,
      y: 88.0,
    },
    room_404: {
      id: 'room_404',
      floor: '4F',
      type: 'classroom',
      roomNumber: '404-2호',
      name: '404-2호 (컴퓨터비전실습실)',
      dept: 'AI융합학부',
      shortLabel: '404-2호',
      aliases: ['IT대학 404호', '404호', '404-2호'],
      x: 61.5,
      y: 88.0,
    },
    room_405: {
      id: 'room_405',
      floor: '4F',
      type: 'classroom',
      roomNumber: '405호',
      name: '405호 (자연어처리·LLM실습실)',
      dept: 'AI융합학부',
      shortLabel: '405호',
      aliases: ['IT대학 405호', '405호'],
      x: 53.5,
      y: 88.0,
    },
    room_406: {
      id: 'room_406',
      floor: '4F',
      type: 'classroom',
      roomNumber: '406호',
      name: '406호 (정보통신전공강의실)',
      dept: '정보통신학부',
      shortLabel: '406호',
      aliases: ['IT대학 406호', '406호'],
      x: 45.8,
      y: 85.0,
    },
    room_407: {
      id: 'room_407',
      floor: '4F',
      type: 'classroom',
      roomNumber: '407호',
      name: '407호 (컴퓨터학부전공강의실)',
      dept: '컴퓨터학부',
      shortLabel: '407호',
      aliases: ['IT대학 407호', '407호'],
      x: 37.5,
      y: 85.0,
    },
    room_408: {
      id: 'room_408',
      floor: '4F',
      type: 'classroom',
      roomNumber: '408호',
      name: '408호 (스마트모빌리티강의실)',
      dept: '정보통신학부',
      shortLabel: '408호',
      aliases: ['IT대학 408호', '408호'],
      x: 29.0,
      y: 85.0,
    },
    room_409: {
      id: 'room_409',
      floor: '4F',
      type: 'classroom',
      roomNumber: '409호',
      name: '409호 (사이버보안전공강의실)',
      dept: '정보보호학과',
      shortLabel: '409호',
      aliases: ['IT대학 409호', '409호', '409-2호'],
      x: 20.8,
      y: 85.0,
    },
    room_410: {
      id: 'room_410',
      floor: '4F',
      type: 'classroom',
      roomNumber: '410호',
      name: '410호 (지능형로봇제어실습실)',
      dept: 'AI융합학부',
      shortLabel: '410호',
      aliases: ['IT대학 410호', '410호'],
      x: 12.2,
      y: 71.5,
    },
    room_411: {
      id: 'room_411',
      floor: '4F',
      type: 'classroom',
      roomNumber: '411호',
      name: '411호 (임베디드SW연구실)',
      dept: '컴퓨터학부',
      shortLabel: '411호',
      aliases: ['IT대학 411호', '411호'],
      x: 29.0,
      y: 72.0,
    },
    room_412: {
      id: 'room_412',
      floor: '4F',
      type: 'classroom',
      roomNumber: '412호',
      name: '412호 (차세대통신연구실)',
      dept: '정보통신학부',
      shortLabel: '412호',
      aliases: ['IT대학 412호', '412호'],
      x: 37.5,
      y: 72.0,
    },
    room_413: {
      id: 'room_413',
      floor: '4F',
      type: 'classroom',
      roomNumber: '413호',
      name: '413호 (데이터마이닝실습실)',
      dept: '데이터과학부',
      shortLabel: '413호',
      aliases: ['IT대학 413호', '413호'],
      x: 61.5,
      y: 78.5,
    },
    room_414: {
      id: 'room_414',
      floor: '4F',
      type: 'classroom',
      roomNumber: '414호',
      name: '414호 (AI융합프로젝트실)',
      dept: 'AI융합학부',
      shortLabel: '414호',
      aliases: ['IT대학 414호', '414호'],
      x: 78.5,
      y: 78.5,
    },
    room_415: {
      id: 'room_415',
      floor: '4F',
      type: 'classroom',
      roomNumber: '415호',
      name: '415호 (학부공동SW실습실)',
      dept: 'IT대학 공통',
      shortLabel: '415호',
      aliases: ['IT대학 415호', '415호'],
      x: 88.5,
      y: 78.5,
    },

    // =========================================================================
    // [5F] 5층 (500호대 · 교수연구실/대학원연구실, 도면 4.pdf)
    // =========================================================================
    elv_east_5F: {
      id: 'elv_east_5F',
      floor: '5F',
      type: 'elevator',
      shaftId: 'elv_east',
      name: '동측 엘리베이터 (5층)',
      shortLabel: '🛗 엘리베이터',
      x: 70.2,
      y: 78.5,
    },
    stair_east_5F: {
      id: 'stair_east_5F',
      floor: '5F',
      type: 'stairs',
      shaftId: 'stair_east',
      name: '동측 주계단 (5층)',
      shortLabel: '🪜 계단',
      x: 73.5,
      y: 78.8,
    },
    elv_west_5F: {
      id: 'elv_west_5F',
      floor: '5F',
      type: 'elevator',
      shaftId: 'elv_west',
      name: '서측 엘리베이터 (5층)',
      shortLabel: '🛗 서측 엘리베이터',
      x: 11.5,
      y: 59.8,
    },
    stair_west_5F: {
      id: 'stair_west_5F',
      floor: '5F',
      type: 'stairs',
      shaftId: 'stair_west',
      name: '서측 비상계단 (5층)',
      shortLabel: '🪜 서측 계단',
      x: 6.5,
      y: 61.5,
    },
    wc_men_5F: {
      id: 'wc_men_5F',
      floor: '5F',
      type: 'restroom',
      name: '5층 남자화장실',
      shortLabel: '🚻 남자화장실',
      x: 26.8,
      y: 75.5,
    },
    wc_women_5F: {
      id: 'wc_women_5F',
      floor: '5F',
      type: 'restroom',
      name: '5층 여자화장실',
      shortLabel: '🚻 여자화장실',
      x: 31.2,
      y: 75.5,
    },

    // 5F 복도 교차로 노드
    c5_w_elv: { id: 'c5_w_elv', floor: '5F', type: 'corridor', name: '5층 서측 엘리베이터 앞', x: 15.5, y: 59.8 },
    c5_w_stair: { id: 'c5_w_stair', floor: '5F', type: 'corridor', name: '5층 서측 계단 앞', x: 9.5, y: 64.5 },
    c5_w_mid: { id: 'c5_w_mid', floor: '5F', type: 'corridor', name: '515호 앞 서측 복도', x: 15.5, y: 71.0 },
    c5_sw_corner: { id: 'c5_sw_corner', floor: '5F', type: 'corridor', name: '514호 앞 코너', x: 15.5, y: 81.2 },
    c5_513: { id: 'c5_513', floor: '5F', type: 'corridor', name: '513호·화장실 앞 복도', x: 25.0, y: 81.2 },
    c5_510: { id: 'c5_510', floor: '5F', type: 'corridor', name: '510~512호 앞 복도', x: 41.0, y: 81.2 },
    c5_508: { id: 'c5_508', floor: '5F', type: 'corridor', name: '508·524호 앞 복도', x: 54.5, y: 83.8 },
    c5_507: { id: 'c5_507', floor: '5F', type: 'corridor', name: '507호 앞 복도', x: 65.0, y: 83.8 },
    c5_elv_east: { id: 'c5_elv_east', floor: '5F', type: 'corridor', name: '5층 동측 엘리베이터 앞', x: 70.2, y: 83.8 },
    c5_stair_east: { id: 'c5_stair_east', floor: '5F', type: 'corridor', name: '5층 동측 계단 앞', x: 73.5, y: 83.8 },
    c5_505: { id: 'c5_505', floor: '5F', type: 'corridor', name: '505·527호 앞 복도', x: 78.5, y: 83.8 },
    c5_503: { id: 'c5_503', floor: '5F', type: 'corridor', name: '503호 앞 복도', x: 85.0, y: 83.8 },
    c5_501: { id: 'c5_501', floor: '5F', type: 'corridor', name: '501·530호 앞 복도', x: 92.0, y: 83.8 },

    // 5F 연구실/강의실 노드
    room_501: {
      id: 'room_501',
      floor: '5F',
      type: 'classroom',
      roomNumber: '501호',
      name: '501호 (IT대학장실 · 교수연구실)',
      dept: 'IT대학 본부',
      shortLabel: '501호 학장실',
      aliases: ['IT대학 501호', '501호', '학장실'],
      x: 92.8,
      y: 88.0,
    },
    room_503: {
      id: 'room_503',
      floor: '5F',
      type: 'classroom',
      roomNumber: '503호',
      name: '503호 (컴퓨터학부 교수연구실)',
      dept: '컴퓨터학부',
      shortLabel: '503호',
      aliases: ['IT대학 503호', '503호'],
      x: 85.0,
      y: 88.0,
    },
    room_505: {
      id: 'room_505',
      floor: '5F',
      type: 'classroom',
      roomNumber: '505호',
      name: '505호 (정보통신학부 교수연구실)',
      dept: '정보통신학부',
      shortLabel: '505호',
      aliases: ['IT대학 505호', '505호'],
      x: 76.8,
      y: 88.0,
    },
    room_507: {
      id: 'room_507',
      floor: '5F',
      type: 'classroom',
      roomNumber: '507호',
      name: '507호 (AI융합대학원 세미나실)',
      dept: 'AI융합대학원',
      shortLabel: '507호',
      aliases: ['IT대학 507호', '507호'],
      x: 65.0,
      y: 88.0,
    },
    room_508: {
      id: 'room_508',
      floor: '5F',
      type: 'classroom',
      roomNumber: '508호',
      name: '508호 (대학원 공동연구실)',
      dept: 'IT대학원',
      shortLabel: '508호',
      aliases: ['IT대학 508호', '508호'],
      x: 54.5,
      y: 88.0,
    },
    room_510: {
      id: 'room_510',
      floor: '5F',
      type: 'classroom',
      roomNumber: '510호',
      name: '510호 (데이터과학 교수연구실)',
      dept: '데이터과학부',
      shortLabel: '510호',
      aliases: ['IT대학 510호', '510호'],
      x: 43.2,
      y: 87.0,
    },
    room_513: {
      id: 'room_513',
      floor: '5F',
      type: 'classroom',
      roomNumber: '513호',
      name: '513호 (소프트웨어학과 교수연구실)',
      dept: '컴퓨터학부',
      shortLabel: '513호',
      aliases: ['IT대학 513호', '513호'],
      x: 25.0,
      y: 87.0,
    },
    room_514: {
      id: 'room_514',
      floor: '5F',
      type: 'classroom',
      roomNumber: '514호',
      name: '514호 (사이버보안 교수연구실)',
      dept: '정보보호학과',
      shortLabel: '514호',
      aliases: ['IT대학 514호', '514호'],
      x: 12.2,
      y: 87.0,
    },
    room_515: {
      id: 'room_515',
      floor: '5F',
      type: 'classroom',
      roomNumber: '515호',
      name: '515호 (지능형시스템연구실)',
      dept: 'AI융합학부',
      shortLabel: '515호',
      aliases: ['IT대학 515호', '515호'],
      x: 11.2,
      y: 74.0,
    },
    room_524: {
      id: 'room_524',
      floor: '5F',
      type: 'classroom',
      roomNumber: '524호',
      name: '524호 (석박사통합연구실)',
      dept: 'IT대학원',
      shortLabel: '524호',
      aliases: ['IT대학 524호', '524호'],
      x: 57.2,
      y: 79.0,
    },
    room_527: {
      id: 'room_527',
      floor: '5F',
      type: 'classroom',
      roomNumber: '527호',
      name: '527호 (산학R&D센터)',
      dept: 'IT대학 산학협력',
      shortLabel: '527호',
      aliases: ['IT대학 527호', '527호'],
      x: 81.0,
      y: 78.0,
    },
    room_530: {
      id: 'room_530',
      floor: '5F',
      type: 'classroom',
      roomNumber: '530호',
      name: '530호 (클라우드아키텍처연구실)',
      dept: '컴퓨터학부',
      shortLabel: '530호',
      aliases: ['IT대학 530호', '530호'],
      x: 92.8,
      y: 78.0,
    },
  },

  /**
   * 평면도 내 복도 간선 (양방향) + 수직 통로 간선 (층간 이동)
   */
  edges: [
    // --- [1F] 복도 연결 ---
    { from: 'ent_1f_main', to: 'c1_se_entry', weight: 8 },
    { from: 'c1_se_entry', to: 'room_101', weight: 12 },
    { from: 'c1_se_entry', to: 'c1_e_junction', weight: 10 },
    { from: 'c1_e_junction', to: 'c1_elv_east', weight: 6 },
    { from: 'c1_elv_east', to: 'elv_east_1F', weight: 5 },
    { from: 'c1_e_junction', to: 'c1_e_stair_front', weight: 10 },
    { from: 'c1_e_stair_front', to: 'stair_east_1F', weight: 3 },
    { from: 'c1_e_stair_front', to: 'room_105', weight: 15 },
    { from: 'c1_e_stair_front', to: 'c1_e_atrium', weight: 16 },
    { from: 'ent_1f_east', to: 'c1_e_door', weight: 8 },
    { from: 'c1_e_door', to: 'c1_e_atrium', weight: 10 },
    { from: 'c1_e_atrium', to: 'c1_e_north1', weight: 12 },
    { from: 'c1_e_north1', to: 'room_119', weight: 12 },
    { from: 'c1_e_north1', to: 'c1_e_north2', weight: 6 },
    { from: 'c1_e_north2', to: 'room_120', weight: 7 },
    { from: 'c1_e_north2', to: 'c1_n_entry', weight: 8 },
    { from: 'ent_1f_north', to: 'c1_n_entry', weight: 6 },
    { from: 'c1_n_entry', to: 'room_121', weight: 7 },
    { from: 'c1_n_entry', to: 'room_122', weight: 12 },

    { from: 'c1_e_junction', to: 'c1_s_east', weight: 7 },
    { from: 'c1_s_east', to: 'wc_men_1F', weight: 5 },
    { from: 'c1_s_east', to: 'c1_s_mid2', weight: 9 },
    { from: 'c1_s_mid2', to: 'wc_women_1F', weight: 5 },
    { from: 'c1_s_mid2', to: 'c1_s_center', weight: 12 },
    { from: 'c1_s_center', to: 'c1_s_mid1', weight: 11 },
    { from: 'c1_s_mid1', to: 'room_109', weight: 14 },
    { from: 'c1_s_mid1', to: 'room_117', weight: 5 },
    { from: 'c1_s_mid1', to: 'room_118', weight: 7 },
    { from: 'c1_s_mid1', to: 'c1_s_west', weight: 8 },
    { from: 'c1_s_west', to: 'room_110', weight: 6 },
    { from: 'c1_s_west', to: 'room_116', weight: 5 },
    { from: 'c1_s_west', to: 'c1_w_lobby', weight: 8 },
    { from: 'c1_w_lobby', to: 'room_115', weight: 5 },
    { from: 'c1_w_lobby', to: 'elv_west_1F', weight: 6 },
    { from: 'c1_w_lobby', to: 'c1_w_stair', weight: 7 },
    { from: 'c1_w_stair', to: 'stair_west_1F', weight: 4 },

    // --- [2F] 복도 연결 (★ 203호 포함) ---
    { from: 'ent_2f_south', to: 'c2_s_vestibule', weight: 7 },
    { from: 'c2_s_vestibule', to: 'c2_s_lobby', weight: 8 },
    { from: 'c2_s_lobby', to: 'c2_elv_east', weight: 8 },
    { from: 'c2_elv_east', to: 'elv_east_2F', weight: 5 },
    { from: 'c2_elv_east', to: 'c2_201_front', weight: 6 },
    { from: 'c2_201_front', to: 'room_201', weight: 10 },
    { from: 'c2_elv_east', to: 'c2_e_junction', weight: 7 },
    { from: 'ent_2f_east', to: 'c2_e_junction', weight: 12 },
    { from: 'c2_e_junction', to: 'c2_e_stair_front', weight: 11 },
    { from: 'c2_e_stair_front', to: 'stair_east_2F', weight: 4 },
    { from: 'c2_e_stair_front', to: 'c2_e_213', weight: 5 },
    { from: 'c2_e_213', to: 'room_213', weight: 8 },
    { from: 'c2_e_213', to: 'c2_e_214', weight: 14 },
    { from: 'c2_e_214', to: 'room_214', weight: 8 },
    { from: 'c2_e_214', to: 'c2_e_215', weight: 10 },
    { from: 'c2_e_215', to: 'room_215', weight: 8 },
    { from: 'c2_e_215', to: 'c2_e_216', weight: 10 },
    { from: 'c2_e_216', to: 'room_216', weight: 8 },
    { from: 'c2_e_216', to: 'c2_e_north', weight: 7 },
    { from: 'c2_e_north', to: 'room_217', weight: 9 },
    { from: 'c2_e_north', to: 'room_218', weight: 5 },
    { from: 'c2_e_north', to: 'room_219', weight: 4 },
    { from: 'c2_e_north', to: 'c2_n_wc', weight: 14 },
    { from: 'c2_n_wc', to: 'wc_men_2F', weight: 4 },
    { from: 'c2_n_wc', to: 'wc_women_2F', weight: 5 },

    { from: 'c2_s_lobby', to: 'c2_203_front', weight: 10 },
    { from: 'c2_203_front', to: 'room_203', weight: 8 },
    { from: 'c2_203_front', to: 'c2_204_front', weight: 7 },
    { from: 'c2_204_front', to: 'room_204', weight: 8 },
    { from: 'c2_204_front', to: 'room_211', weight: 5 },
    { from: 'c2_204_front', to: 'c2_205_front', weight: 8 },
    { from: 'c2_205_front', to: 'room_205', weight: 8 },
    { from: 'c2_205_front', to: 'room_210', weight: 5 },
    { from: 'c2_205_front', to: 'c2_206_front', weight: 8 },
    { from: 'c2_206_front', to: 'room_206', weight: 8 },
    { from: 'c2_206_front', to: 'room_209', weight: 6 },
    { from: 'c2_206_front', to: 'c2_207_front', weight: 9 },
    { from: 'c2_207_front', to: 'room_207', weight: 8 },
    { from: 'c2_207_front', to: 'c2_sw_corner', weight: 5 },
    { from: 'c2_sw_corner', to: 'room_208', weight: 7 },
    { from: 'c2_sw_corner', to: 'c2_w_mid', weight: 12 },
    { from: 'c2_w_mid', to: 'c2_w_stair', weight: 7 },
    { from: 'c2_w_stair', to: 'stair_west_2F', weight: 4 },
    { from: 'c2_w_mid', to: 'c2_w_elv', weight: 5 },
    { from: 'c2_w_elv', to: 'elv_west_2F', weight: 5 },
    { from: 'c2_w_elv', to: 'c2_w_212', weight: 15 },
    { from: 'c2_w_212', to: 'room_212', weight: 5 },

    // --- [3F] 복도 연결 (서측 언덕 3F 출입구 포함) ---
    { from: 'ent_3f_west', to: 'c3_w_entry', weight: 9 },
    { from: 'c3_w_entry', to: 'c3_w_mid', weight: 9 },
    { from: 'c3_w_mid', to: 'c3_w_stair', weight: 6 },
    { from: 'c3_w_stair', to: 'stair_west_3F', weight: 4 },
    { from: 'c3_w_mid', to: 'c3_w_elv', weight: 5 },
    { from: 'c3_w_elv', to: 'elv_west_3F', weight: 5 },
    { from: 'c3_w_elv', to: 'c3_w_311', weight: 15 },
    { from: 'c3_w_311', to: 'room_311', weight: 5 },
    { from: 'c3_w_entry', to: 'c3_sw_corner', weight: 6 },
    { from: 'c3_sw_corner', to: 'room_310', weight: 7 },
    { from: 'c3_sw_corner', to: 'c3_s_309', weight: 6 },
    { from: 'c3_s_309', to: 'room_309', weight: 6 },
    { from: 'c3_s_309', to: 'c3_s_308', weight: 8 },
    { from: 'c3_s_308', to: 'room_308', weight: 6 },
    { from: 'c3_s_308', to: 'c3_s_307', weight: 8 },
    { from: 'c3_s_307', to: 'room_307', weight: 6 },
    { from: 'c3_s_307', to: 'c3_s_306', weight: 8 },
    { from: 'c3_s_306', to: 'room_306', weight: 6 },
    { from: 'c3_s_306', to: 'c3_s_304', weight: 9 },
    { from: 'c3_s_304', to: 'room_304', weight: 5 },
    { from: 'c3_s_304', to: 'room_305', weight: 4 },
    { from: 'c3_s_304', to: 'c3_se_hall', weight: 14 },
    { from: 'c3_se_hall', to: 'c3_elv_east', weight: 9 },
    { from: 'c3_elv_east', to: 'elv_east_3F', weight: 5 },
    { from: 'c3_se_hall', to: 'c3_303', weight: 4 },
    { from: 'c3_303', to: 'room_303', weight: 5 },
    { from: 'c3_303', to: 'c3_stair_east', weight: 4 },
    { from: 'c3_stair_east', to: 'stair_east_3F', weight: 5 },
    { from: 'c3_stair_east', to: 'c3_302', weight: 5 },
    { from: 'c3_302', to: 'room_302', weight: 5 },
    { from: 'c3_302', to: 'room_312', weight: 6 },
    { from: 'c3_302', to: 'c3_301', weight: 10 },
    { from: 'c3_301', to: 'room_301', weight: 5 },
    { from: 'c3_301', to: 'room_313', weight: 6 },

    // --- [4F] 복도 연결 ---
    { from: 'elv_west_4F', to: 'c4_w_elv', weight: 5 },
    { from: 'stair_west_4F', to: 'c4_w_stair', weight: 4 },
    { from: 'c4_w_stair', to: 'c4_w_mid', weight: 7 },
    { from: 'c4_w_elv', to: 'c4_w_mid', weight: 7 },
    { from: 'c4_w_mid', to: 'room_410', weight: 6 },
    { from: 'c4_w_mid', to: 'c4_sw_corner', weight: 10 },
    { from: 'c4_sw_corner', to: 'c4_409', weight: 5 },
    { from: 'c4_409', to: 'room_409', weight: 8 },
    { from: 'c4_409', to: 'c4_408', weight: 8 },
    { from: 'c4_408', to: 'room_408', weight: 8 },
    { from: 'c4_408', to: 'room_411', weight: 6 },
    { from: 'c4_408', to: 'c4_407', weight: 8 },
    { from: 'c4_407', to: 'room_407', weight: 8 },
    { from: 'c4_407', to: 'room_412', weight: 6 },
    { from: 'c4_407', to: 'c4_406', weight: 8 },
    { from: 'c4_406', to: 'room_406', weight: 8 },
    { from: 'c4_406', to: 'wc_women_4F', weight: 4 },
    { from: 'c4_406', to: 'c4_mid_drop', weight: 9 },
    { from: 'c4_mid_drop', to: 'wc_men_4F', weight: 7 },
    { from: 'c4_mid_drop', to: 'room_405', weight: 5 },
    { from: 'c4_mid_drop', to: 'c4_404', weight: 10 },
    { from: 'c4_404', to: 'room_404', weight: 5 },
    { from: 'c4_404', to: 'room_413', weight: 6 },
    { from: 'c4_404', to: 'c4_elv_east', weight: 6 },
    { from: 'c4_elv_east', to: 'elv_east_4F', weight: 6 },
    { from: 'c4_elv_east', to: 'c4_403', weight: 4 },
    { from: 'c4_403', to: 'room_403', weight: 5 },
    { from: 'c4_403', to: 'c4_stair_east', weight: 4 },
    { from: 'c4_stair_east', to: 'stair_east_4F', weight: 5 },
    { from: 'c4_stair_east', to: 'c4_402', weight: 5 },
    { from: 'c4_402', to: 'room_402', weight: 5 },
    { from: 'c4_402', to: 'room_414', weight: 6 },
    { from: 'c4_402', to: 'c4_401', weight: 10 },
    { from: 'c4_401', to: 'room_401', weight: 5 },
    { from: 'c4_401', to: 'room_415', weight: 6 },

    // --- [5F] 복도 연결 ---
    { from: 'elv_west_5F', to: 'c5_w_elv', weight: 5 },
    { from: 'stair_west_5F', to: 'c5_w_stair', weight: 4 },
    { from: 'c5_w_stair', to: 'c5_w_mid', weight: 8 },
    { from: 'c5_w_elv', to: 'c5_w_mid', weight: 11 },
    { from: 'c5_w_mid', to: 'room_515', weight: 5 },
    { from: 'c5_w_mid', to: 'c5_sw_corner', weight: 10 },
    { from: 'c5_sw_corner', to: 'room_514', weight: 7 },
    { from: 'c5_sw_corner', to: 'c5_513', weight: 10 },
    { from: 'c5_513', to: 'room_513', weight: 6 },
    { from: 'c5_513', to: 'wc_men_5F', weight: 6 },
    { from: 'c5_513', to: 'wc_women_5F', weight: 8 },
    { from: 'c5_513', to: 'c5_510', weight: 16 },
    { from: 'c5_510', to: 'room_510', weight: 6 },
    { from: 'c5_510', to: 'c5_508', weight: 14 },
    { from: 'c5_508', to: 'room_508', weight: 5 },
    { from: 'c5_508', to: 'room_524', weight: 6 },
    { from: 'c5_508', to: 'c5_507', weight: 10 },
    { from: 'c5_507', to: 'room_507', weight: 5 },
    { from: 'c5_507', to: 'c5_elv_east', weight: 5 },
    { from: 'c5_elv_east', to: 'elv_east_5F', weight: 5 },
    { from: 'c5_elv_east', to: 'c5_stair_east', weight: 4 },
    { from: 'c5_stair_east', to: 'stair_east_5F', weight: 5 },
    { from: 'c5_stair_east', to: 'c5_505', weight: 5 },
    { from: 'c5_505', to: 'room_505', weight: 5 },
    { from: 'c5_505', to: 'room_527', weight: 6 },
    { from: 'c5_505', to: 'c5_503', weight: 7 },
    { from: 'c5_503', to: 'room_503', weight: 5 },
    { from: 'c5_503', to: 'c5_501', weight: 7 },
    { from: 'c5_501', to: 'room_501', weight: 5 },
    { from: 'c5_501', to: 'room_530', weight: 6 },

    // =========================================================================
    // [수직 통로 간선: 엘리베이터(elevator) 전용 층간 연결]
    // =========================================================================
    { from: 'elv_east_1F', to: 'elv_east_2F', weight: 15, isVertical: true, transitType: 'elevator' },
    { from: 'elv_east_2F', to: 'elv_east_3F', weight: 15, isVertical: true, transitType: 'elevator' },
    { from: 'elv_east_3F', to: 'elv_east_4F', weight: 15, isVertical: true, transitType: 'elevator' },
    { from: 'elv_east_4F', to: 'elv_east_5F', weight: 15, isVertical: true, transitType: 'elevator' },

    { from: 'elv_west_1F', to: 'elv_west_2F', weight: 15, isVertical: true, transitType: 'elevator' },
    { from: 'elv_west_2F', to: 'elv_west_3F', weight: 15, isVertical: true, transitType: 'elevator' },
    { from: 'elv_west_3F', to: 'elv_west_4F', weight: 15, isVertical: true, transitType: 'elevator' },
    { from: 'elv_west_4F', to: 'elv_west_5F', weight: 15, isVertical: true, transitType: 'elevator' },

    // =========================================================================
    // [수직 통로 간선: 계단(stairs) 전용 층간 연결]
    // =========================================================================
    { from: 'stair_east_1F', to: 'stair_east_2F', weight: 18, isVertical: true, transitType: 'stairs' },
    { from: 'stair_east_2F', to: 'stair_east_3F', weight: 18, isVertical: true, transitType: 'stairs' },
    { from: 'stair_east_3F', to: 'stair_east_4F', weight: 18, isVertical: true, transitType: 'stairs' },
    { from: 'stair_east_4F', to: 'stair_east_5F', weight: 18, isVertical: true, transitType: 'stairs' },

    { from: 'stair_west_1F', to: 'stair_west_2F', weight: 18, isVertical: true, transitType: 'stairs' },
    { from: 'stair_west_2F', to: 'stair_west_3F', weight: 18, isVertical: true, transitType: 'stairs' },
    { from: 'stair_west_3F', to: 'stair_west_4F', weight: 18, isVertical: true, transitType: 'stairs' },
    { from: 'stair_west_4F', to: 'stair_west_5F', weight: 18, isVertical: true, transitType: 'stairs' },
  ],
};

/**
 * 다층 실내 최단 경로 탐색기 (Multi-Floor Indoor Dijkstra Router)
 * - 엘리베이터 전용 경로(mode: 'elevator')와 계단 전용 경로(mode: 'stairs')를 각각 독립적으로 계산
 * - 절대 벽을 가로지르는 직선으로 잇지 않고 [출발 입구 ➔ 현재 층 수직통로 ➔ 도착 층 수직통로 ➔ 목적지 강의실] 순서 보장
 */
class IndoorMultiFloorRouter {
  constructor(indoorData) {
    this.data = indoorData;
    this.nodes = indoorData.nodes;
    this.edges = indoorData.edges;
  }

  /**
   * 특정 수직 이동 수단('elevator' | 'stairs')만 허용하는 인접 리스트 생성
   */
  buildAdjacency(transitMode) {
    const adj = {};
    Object.keys(this.nodes).forEach((id) => {
      adj[id] = [];
    });

    this.edges.forEach((edge) => {
      if (edge.isVertical && edge.transitType !== transitMode) {
        return; // 선택된 수직 이동 수단(엘리베이터 vs 계단)이 아니면 제외
      }
      if (adj[edge.from] && adj[edge.to]) {
        adj[edge.from].push({
          to: edge.to,
          weight: edge.weight,
          isVertical: Boolean(edge.isVertical),
          transitType: edge.transitType || null,
        });
        adj[edge.to].push({
          to: edge.from,
          weight: edge.weight,
          isVertical: Boolean(edge.isVertical),
          transitType: edge.transitType || null,
        });
      }
    });

    return adj;
  }

  /**
   * 단일 모드('elevator' | 'stairs') 다익스트라 최단 경로 계산
   */
  findRoute(startNodeId, endNodeId, transitMode = 'elevator') {
    const startNode = this.nodes[startNodeId];
    const endNode = this.nodes[endNodeId];
    if (!startNode || !endNode) return null;

    const adj = this.buildAdjacency(transitMode);
    const dist = {};
    const prev = {};
    const visited = new Set();

    Object.keys(this.nodes).forEach((id) => {
      dist[id] = Infinity;
      prev[id] = null;
    });
    dist[startNodeId] = 0;

    while (true) {
      let u = null;
      let bestDist = Infinity;
      for (const id of Object.keys(this.nodes)) {
        if (!visited.has(id) && dist[id] < bestDist) {
          bestDist = dist[id];
          u = id;
        }
      }
      if (u === null || u === endNodeId) break;
      visited.add(u);

      for (const neighbor of adj[u] || []) {
        if (visited.has(neighbor.to)) continue;
        const alt = dist[u] + neighbor.weight;
        if (alt < dist[neighbor.to]) {
          dist[neighbor.to] = alt;
          prev[neighbor.to] = u;
        }
      }
    }

    if (dist[endNodeId] === Infinity) return null;

    // 경로 역추적
    const pathIds = [];
    let curr = endNodeId;
    while (curr) {
      pathIds.unshift(curr);
      curr = prev[curr];
    }

    const fullNodes = pathIds.map((id) => this.nodes[id]);

    // 층별 세그먼트 분리 (예: 1F 구간 -> 2F/3F 구간)
    // 다층 이동(예: 1F -> 3F) 시 중간에 엘리베이터/계단 통로로만 스쳐 지나가는 층(노드 1개짜리 구간)은 제외해
    // 출발 층(예: 1F)과 도착 층(예: 3F) 세그먼트만 깔끔하게 남김
    const rawFloorSegments = [];
    let currentSeg = null;
    fullNodes.forEach((node) => {
      if (!currentSeg || currentSeg.floor !== node.floor) {
        currentSeg = {
          floor: node.floor,
          nodes: [node],
        };
        rawFloorSegments.push(currentSeg);
      } else {
        currentSeg.nodes.push(node);
      }
    });

    const isSameFloor = startNode.floor === endNode.floor;
    const floorSegments = isSameFloor
      ? rawFloorSegments
      : rawFloorSegments.filter(
          (seg) =>
            seg.nodes.length >= 2 ||
            seg.floor === startNode.floor ||
            seg.floor === endNode.floor
        );

    // 수직 이동(층간 이동) 정보 추출
    let verticalTransition = null;

    if (!isSameFloor && floorSegments.length >= 2) {
      const firstSeg = floorSegments[0];
      const lastSeg = floorSegments[floorSegments.length - 1];
      const departureTransitNode = firstSeg.nodes[firstSeg.nodes.length - 1];
      const arrivalTransitNode = lastSeg.nodes[0];
      const startFloorNum = parseInt(startNode.floor, 10) || 1;
      const endFloorNum = parseInt(endNode.floor, 10) || 2;
      const floorDiff = Math.abs(endFloorNum - startFloorNum);

      verticalTransition = {
        fromFloor: startNode.floor,
        toFloor: endNode.floor,
        direction: endFloorNum > startFloorNum ? 'up' : 'down',
        floorDiff,
        transitType: transitMode,
        departureNode: departureTransitNode,
        arrivalNode: arrivalTransitNode,
        ttsPrompt:
          transitMode === 'elevator'
            ? `엘리베이터를 타고 ${endNode.floor.replace('F', '층')}으로 이동하세요.`
            : `계단을 이용해 ${endNode.floor.replace('F', '층')}으로 이동하세요.`,
        buttonLabel: `${endNode.floor.replace('F', '층')} 이동 완료`,
      };
    }

    // 거리 및 예상 소요시간 산출
    // 요구사항: [🛗 엘리베이터 경로 (예상 3분)] vs [🪜 계단 경로 (예상 2분)]
    const totalDistanceMeters = Math.round(dist[endNodeId]);
    let estimatedMinutes = 1;
    if (!isSameFloor) {
      const startFloorNum = parseInt(startNode.floor, 10) || 1;
      const endFloorNum = parseInt(endNode.floor, 10) || 2;
      const floorDiff = Math.abs(endFloorNum - startFloorNum);
      if (transitMode === 'elevator') {
        // 엘리베이터 대기 시간 포함: 1개층 이동 시 약 3분, 층수 차이에 비례
        estimatedMinutes = Math.max(3, 2 + floorDiff);
      } else {
        // 계단 도보 이동: 1~2개층 이동 시 약 2분, 3개층 이상은 층당 +1분
        estimatedMinutes = floorDiff <= 1 ? 2 : 1 + floorDiff;
      }
    } else {
      estimatedMinutes = 1;
    }

    // 단계별 음성 안내(TTS) 체크포인트 생성
    const steps = this.buildIndoorSteps(startNode, endNode, floorSegments, verticalTransition, transitMode);

    return {
      transitMode,
      isSameFloor,
      startNode,
      endNode,
      fullNodes,
      floorSegments,
      verticalTransition,
      totalDistanceMeters,
      estimatedMinutes,
      steps,
    };
  }

  /**
   * 엘리베이터 경유 최단 루트 + 계단 경유 최단 루트 동시 계산
   */
  findDualRoutes(startNodeId, endNodeId) {
    const elevatorRoute = this.findRoute(startNodeId, endNodeId, 'elevator');
    const stairsRoute = this.findRoute(startNodeId, endNodeId, 'stairs');
    return {
      elevator: elevatorRoute,
      stairs: stairsRoute,
    };
  }

  /**
   * 실내 턴바이턴 음성 안내(TTS) 문구 생성
   */
  buildIndoorSteps(startNode, endNode, floorSegments, verticalTransition, transitMode) {
    const steps = [];
    const startFloorKo = startNode.floor.replace('F', '층');
    const endFloorKo = endNode.floor.replace('F', '층');
    const roomLabel = endNode.roomNumber || endNode.name;

    if (!verticalTransition) {
      steps.push({
        floor: startNode.floor,
        type: 'depart',
        node: startNode,
        title: `${startNode.name}에서 출발`,
        ttsText: `${startNode.name}에서 같은 층(${startFloorKo})에 있는 ${roomLabel}까지 실내 안내를 시작합니다.`,
      });
      steps.push({
        floor: endNode.floor,
        type: 'arrive',
        node: endNode,
        title: `${roomLabel} 도착`,
        ttsText: `목적지 ${roomLabel} 강의실 문 앞에 도착했습니다. 안내를 종료합니다.`,
      });
      return steps;
    }

    const transitNameKo = transitMode === 'elevator' ? '엘리베이터' : '계단';
    const depNode = verticalTransition.departureNode;
    const arrNode = verticalTransition.arrivalNode;

    steps.push({
      floor: startNode.floor,
      type: 'depart',
      node: startNode,
      title: `${startNode.name} (${startFloorKo}) 진입`,
      ttsText: `${startNode.name}로 진입했습니다. ${startFloorKo} 복도를 따라 ${depNode.name}까지 이동하세요.`,
    });

    steps.push({
      floor: startNode.floor,
      type: 'transit_wait',
      node: depNode,
      title: `${depNode.name} 도달 ➔ ${endFloorKo} 이동`,
      ttsText: verticalTransition.ttsPrompt,
      requiresFloorConfirm: true,
      targetFloor: endNode.floor,
      buttonLabel: verticalTransition.buttonLabel,
    });

    steps.push({
      floor: endNode.floor,
      type: 'transit_arrive',
      node: arrNode,
      title: `${endFloorKo} ${transitNameKo} 하차 후 복도 이동`,
      ttsText: `${endFloorKo}에 도착했습니다. 복도 화살표를 따라 ${roomLabel} 앞까지 이동하세요.`,
    });

    steps.push({
      floor: endNode.floor,
      type: 'arrive',
      node: endNode,
      title: `목적지 ${roomLabel} 도착`,
      ttsText: `목적지 IT대학 ${roomLabel} 강의실 앞에 도착했습니다. 실내 길안내를 종료합니다.`,
    });

    return steps;
  }

  /**
   * 야외 출발지(startBuildingId)에 따라 IT대학의 최적 진입 출입구를 자동 판별
   */
  resolveEntranceForOutdoorOrigin(outdoorOriginId) {
    if (!outdoorOriginId) {
      return this.data.entrances[0]; // 기본값: 남동측 1층 주출입구 (1F)
    }
    const matched = this.data.entrances.find(
      (ent) => Array.isArray(ent.approachFrom) && ent.approachFrom.includes(outdoorOriginId)
    );
    return matched || this.data.entrances[0];
  }
}

window.IT_COLLEGE_INDOOR_DATA = IT_COLLEGE_INDOOR_DATA;
window.IndoorMultiFloorRouter = IndoorMultiFloorRouter;

