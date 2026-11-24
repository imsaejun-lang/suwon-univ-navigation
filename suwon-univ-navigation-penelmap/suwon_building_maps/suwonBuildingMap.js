/**
 * 수원대학교 전 건물 도식화 실내 지도 SVG 렌더러 · 개별 섹터 제어 · 복도 전용 다층 길찾기 API
 *
 * Zero-dependency UMD module (Browser global: window.SuwonBuildingMap, CommonJS/Node export supported)
 * 사용 데이터: suwon_building_maps/catalog.json 및 <building_dir>/data.json
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.SuwonBuildingMap = factory(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : window, function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var PALETTE = {
    canvasBg: '#f8fafc',
    shellBg: '#f1f5f9',
    outerWall: '#94a3b8',
    innerWall: '#9aa8ba',
    corridor: '#ffffff',
    classroom: '#edf4ff',
    classroomStroke: '#9aa8ba',
    office: '#f1f5f9',
    officeKey: '#e8eefc',
    lounge: '#fef3c7',
    loungeStroke: '#d97706',
    restroomMen: '#0369a1',
    restroomMenStroke: '#075985',
    restroomWomen: '#ec4899',
    restroomWomenStroke: '#be185d',
    stairsFill: '#bbf7d0',
    stairsStroke: '#16a34a',
    stairsTread: '#15803d',
    elevatorFill: '#ede9fe',
    elevatorStroke: '#7c3aed',
    facility: '#e2e8f0',
    auditorium: '#eef2ff',
    entranceFill: '#f8fafc',
    entranceStroke: '#0d9488',
    voidFill: '#e2e8f0',
    voidStroke: '#cbd5e1',
    selectedFill: '#8cc4ff',
    selectedStartFill: '#7cb9ff',
    selectedEndFill: '#7cb9ff',
    selectedStroke: '#1d4ed8',
    routeCasing: '#ffffff',
    routeStroke: '#0070f3',
    pinStart: '#0284c7',
    pinEnd: '#1d4ed8',
  };

  var _cache = {};

  function resolveBaseUrl(baseUrl) {
    if (!baseUrl) return '.';
    return String(baseUrl).replace(/\/+$/, '');
  }

  function loadCatalog(baseUrl) {
    var b = resolveBaseUrl(baseUrl);
    var url = b + '/catalog.json';
    if (_cache[url]) return Promise.resolve(_cache[url]);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Failed to load catalog: ' + r.status);
      return r.json();
    }).then(function (json) {
      _cache[url] = json;
      return json;
    });
  }

  function loadBuilding(buildingIdOrDir, baseUrl) {
    var b = resolveBaseUrl(baseUrl);
    var key = 'b:' + b + ':' + buildingIdOrDir;
    if (_cache[key]) return Promise.resolve(_cache[key]);
    return loadCatalog(b).then(function (cat) {
      var found = null;
      for (var i = 0; i < cat.buildings.length; i++) {
        var item = cat.buildings[i];
        if (item.id === buildingIdOrDir || item.dir === buildingIdOrDir || item.name === buildingIdOrDir) {
          found = item;
          break;
        }
      }
      if (!found) throw new Error('Building not found in catalog: ' + buildingIdOrDir);
      var url = b + '/' + found.dataPath;
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Failed to load building data: ' + r.status);
        return r.json();
      }).then(function (data) {
        _cache[key] = data;
        return data;
      });
    });
  }

  function getFloorIds(buildingData) {
    return (buildingData && buildingData.floorOrder ? buildingData.floorOrder : Object.keys((buildingData && buildingData.floors) || {})).slice();
  }

  function getFloor(buildingData, floorId) {
    if (!buildingData || !buildingData.floors) return null;
    var raw = String(floorId || '');
    if (buildingData.floors[raw]) return buildingData.floors[raw];
    var up = raw.toUpperCase();
    return buildingData.floors[up] || buildingData.floors[buildingData.floorOrder[0]] || null;
  }

  function listSectors(buildingData, floorId, filter) {
    var floors = floorId ? [String(floorId).toUpperCase()] : getFloorIds(buildingData);
    var excludeVoids = filter && filter.excludeVoids !== false;
    var typesSet = null;
    if (filter && Array.isArray(filter.types) && filter.types.length) {
      typesSet = {};
      for (var i = 0; i < filter.types.length; i++) typesSet[filter.types[i]] = true;
    }
    var out = [];
    for (var fi = 0; fi < floors.length; fi++) {
      var fl = getFloor(buildingData, floors[fi]);
      if (!fl || !fl.sectors) continue;
      for (var si = 0; si < fl.sectors.length; si++) {
        var s = fl.sectors[si];
        if (excludeVoids && s.type === 'void') continue;
        if (typesSet && !typesSet[s.type]) continue;
        out.push(s);
      }
    }
    return out;
  }

  function normalizeQuery(q) {
    return String(q || '').toLowerCase().replace(/\s+/g, '').replace(/호$/, '');
  }

  function findSector(buildingData, queryOrId) {
    var all = listSectors(buildingData, null, { excludeVoids: false });
    var raw = String(queryOrId || '').trim();
    if (!raw) return null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === raw) return all[i];
    }
    var nq = normalizeQuery(raw);
    for (var j = 0; j < all.length; j++) {
      if (all[j].roomNumber && normalizeQuery(all[j].roomNumber) === nq) return all[j];
    }
    for (var k = 0; k < all.length; k++) {
      var hay = normalizeQuery((all[k].name || '') + ' ' + (all[k].shortLabel || ''));
      if (hay && hay.indexOf(nq) !== -1) return all[k];
    }
    return null;
  }

  function buildCombinedNavGraph(buildingData, mode) {
    var adj = {};
    var nodeMeta = {};
    var fids = getFloorIds(buildingData);

    function addEdge(u, v, w, kind, transferType) {
      if (!adj[u]) adj[u] = [];
      adj[u].push({ to: v, weight: w, kind: kind, transferType: transferType || null });
    }

    for (var fi = 0; fi < fids.length; fi++) {
      var fid = fids[fi];
      var fl = buildingData.floors[fid];
      if (!fl || !fl.corridorGraph) continue;
      var nodes = fl.corridorGraph.nodes || {};
      var edges = fl.corridorGraph.edges || [];
      var nkeys = Object.keys(nodes);
      for (var ni = 0; ni < nkeys.length; ni++) {
        var nd = nodes[nkeys[ni]];
        nodeMeta[nd.id] = { id: nd.id, floor: fid, kind: 'corridor', x: nd.x, y: nd.y };
        if (!adj[nd.id]) adj[nd.id] = [];
      }
      for (var ei = 0; ei < edges.length; ei++) {
        var e = edges[ei];
        var w = Math.max(1, Number(e.weight) || 1);
        addEdge(e.from, e.to, w, 'corridor');
        addEdge(e.to, e.from, w, 'corridor');
      }
      for (var si = 0; si < fl.sectors.length; si++) {
        var sec = fl.sectors[si];
        if ((sec.type === 'stairs' || sec.type === 'elevator') && sec.corridorNodeId) {
          var pid = 'portal_' + sec.id;
          nodeMeta[pid] = {
            id: pid,
            floor: fid,
            kind: 'portal',
            portalType: sec.type,
            sector: sec,
            x: sec.center[0],
            y: sec.center[1],
            doorPos: sec.doorPos || sec.center,
          };
          var dw = Math.hypot((sec.doorPos ? sec.doorPos[0] : sec.center[0]) - (nodes[sec.corridorNodeId] ? nodes[sec.corridorNodeId].x : sec.center[0]),
                              (sec.doorPos ? sec.doorPos[1] : sec.center[1]) - (nodes[sec.corridorNodeId] ? nodes[sec.corridorNodeId].y : sec.center[1]));
          addEdge(sec.corridorNodeId, pid, Math.max(2, dw), 'portal_access');
          addEdge(pid, sec.corridorNodeId, Math.max(2, dw), 'portal_access');
        }
      }
    }

    var shafts = buildingData.verticalShafts || [];
    for (var shi = 0; shi < shafts.length; shi++) {
      var sh = shafts[shi];
      if (mode === 'stairs' && sh.type === 'elevator') continue;
      if (mode === 'elevator' && sh.type === 'stairs') continue;
      var sFloors = [];
      for (var fi2 = 0; fi2 < fids.length; fi2++) {
        if (sh.floors[fids[fi2]]) sFloors.push({ floor: fids[fi2], secId: sh.floors[fids[fi2]] });
      }
      for (var a = 0; a < sFloors.length - 1; a++) {
        var pA = 'portal_' + sFloors[a].secId;
        var pB = 'portal_' + sFloors[a + 1].secId;
        if (nodeMeta[pA] && nodeMeta[pB]) {
          var vw = sh.type === 'elevator' ? 45 : 70;
          addEdge(pA, pB, vw, 'vertical', sh.type);
          addEdge(pB, pA, vw, 'vertical', sh.type);
        }
      }
    }

    return { adj: adj, nodeMeta: nodeMeta };
  }

  function findCorridorRoute(buildingData, startIdOrQuery, endIdOrQuery, options) {
    var startSec = typeof startIdOrQuery === 'object' ? startIdOrQuery : findSector(buildingData, startIdOrQuery);
    var endSec = typeof endIdOrQuery === 'object' ? endIdOrQuery : findSector(buildingData, endIdOrQuery);
    if (!startSec || !endSec) {
      return { ok: false, error: '출발지 또는 목적지 섹터를 찾을 수 없습니다.' };
    }
    if (!startSec.corridorNodeId || !endSec.corridorNodeId) {
      return { ok: false, error: '출발지 또는 목적지에 연결된 복도 노드가 없습니다.' };
    }

    var opts = options || {};
    var graph = buildCombinedNavGraph(buildingData, opts.mode || 'any');
    var adj = graph.adj;
    var nodeMeta = graph.nodeMeta;
    var startNode = startSec.corridorNodeId;
    var endNode = endSec.corridorNodeId;

    var dist = {};
    var prev = {};
    var prevEdge = {};
    var visited = {};
    var keys = Object.keys(adj);
    for (var i = 0; i < keys.length; i++) dist[keys[i]] = Infinity;
    dist[startNode] = 0;

    while (true) {
      var u = null;
      var best = Infinity;
      for (var k = 0; k < keys.length; k++) {
        var cand = keys[k];
        if (!visited[cand] && dist[cand] < best) {
          best = dist[cand];
          u = cand;
        }
      }
      if (!u || best === Infinity || u === endNode) break;
      visited[u] = true;
      var nbrs = adj[u] || [];
      for (var ni = 0; ni < nbrs.length; ni++) {
        var edge = nbrs[ni];
        if (visited[edge.to]) continue;
        var nd = best + edge.weight;
        if (nd < dist[edge.to]) {
          dist[edge.to] = nd;
          prev[edge.to] = u;
          prevEdge[edge.to] = edge;
        }
      }
    }

    if (!Number.isFinite(dist[endNode])) {
      return { ok: false, error: '해당 이동 수단(계단/ELV) 조건으로 연결되는 복도 경로가 없습니다.' };
    }

    var chain = [];
    var cur = endNode;
    while (cur) {
      chain.unshift(cur);
      cur = prev[cur];
    }

    var polylinesByFloor = {};
    var floorsVisited = [];
    var transfers = [];
    var steps = [];

    function pushPt(flId, pt) {
      if (!polylinesByFloor[flId]) {
        polylinesByFloor[flId] = [];
        floorsVisited.push(flId);
      }
      var arr = polylinesByFloor[flId];
      var last = arr.length ? arr[arr.length - 1] : null;
      if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 0.5) {
        arr.push([Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10]);
      }
    }

    pushPt(startSec.floor, startSec.doorPos || startSec.center);
    for (var ci = 0; ci < chain.length; ci++) {
      var id = chain[ci];
      var meta = nodeMeta[id];
      var edgeUsed = ci > 0 ? prevEdge[id] : null;
      if (meta.kind === 'corridor') {
        pushPt(meta.floor, [meta.x, meta.y]);
      } else if (meta.kind === 'portal') {
        var dp = meta.doorPos || [meta.x, meta.y];
        pushPt(meta.floor, dp);
        if (edgeUsed && edgeUsed.kind === 'vertical') {
          var pm = nodeMeta[chain[ci - 1]];
          transfers.push({
            type: edgeUsed.transferType,
            fromFloor: pm.floor,
            toFloor: meta.floor,
            fromSector: pm.sector,
            toSector: meta.sector,
            fromPos: pm.doorPos || [pm.x, pm.y],
            toPos: dp,
          });
          steps.push({
            type: 'transfer',
            transferType: edgeUsed.transferType,
            fromFloor: pm.floor,
            toFloor: meta.floor,
            label: pm.floor + ' → ' + meta.floor + ' (' + (edgeUsed.transferType === 'elevator' ? '엘리베이터' : '계단') + ')',
          });
        }
      }
    }
    pushPt(endSec.floor, endSec.doorPos || endSec.center);

    return {
      ok: true,
      buildingId: buildingData.buildingId,
      start: startSec,
      end: endSec,
      floors: floorsVisited,
      totalDistance: Math.round(dist[endNode]),
      transferType: transfers.length ? transfers[0].type : null,
      transfers: transfers,
      polylinesByFloor: polylinesByFloor,
      nodeChain: chain,
      steps: steps,
    };
  }

  function svgEl(tag, attrs, textContent) {
    var doc = global.document;
    var el = doc.createElementNS(SVG_NS, tag);
    if (attrs) {
      var ks = Object.keys(attrs);
      for (var i = 0; i < ks.length; i++) el.setAttribute(ks[i], String(attrs[ks[i]]));
    }
    if (textContent !== undefined && textContent !== null) el.textContent = String(textContent);
    return el;
  }

  function polyToPath(poly) {
    if (!poly || !poly.length) return '';
    var p = ['M', poly[0][0], poly[0][1]];
    for (var i = 1; i < poly.length; i++) p.push('L', poly[i][0], poly[i][1]);
    p.push('Z');
    return p.join(' ');
  }

  function polyBounds(poly) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      if (poly[i][0] < minX) minX = poly[i][0];
      if (poly[i][0] > maxX) maxX = poly[i][0];
      if (poly[i][1] < minY) minY = poly[i][1];
      if (poly[i][1] > maxY) maxY = poly[i][1];
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  function baseSectorStyle(type) {
    switch (type) {
      case 'restroom_men': return { fill: PALETTE.restroomMen, stroke: PALETTE.restroomMenStroke, sw: 1.8 };
      case 'restroom_women': return { fill: PALETTE.restroomWomen, stroke: PALETTE.restroomWomenStroke, sw: 1.8 };
      case 'stairs': return { fill: PALETTE.stairsFill, stroke: PALETTE.stairsStroke, sw: 1.8 };
      case 'elevator': return { fill: PALETTE.elevatorFill, stroke: PALETTE.elevatorStroke, sw: 1.8 };
      case 'lounge': return { fill: PALETTE.lounge, stroke: PALETTE.loungeStroke, sw: 1.6 };
      case 'office': return { fill: PALETTE.officeKey, stroke: PALETTE.innerWall, sw: 1.5 };
      case 'auditorium': return { fill: PALETTE.auditorium, stroke: PALETTE.innerWall, sw: 1.5 };
      case 'facility': return { fill: PALETTE.facility, stroke: PALETTE.innerWall, sw: 1.4 };
      case 'void': return { fill: 'url(#sm-hatch-open)', stroke: PALETTE.voidStroke, sw: 1.2 };
      default: return { fill: PALETTE.classroom, stroke: PALETTE.classroomStroke, sw: 1.5 };
    }
  }

  function drawStairTreads(defs, targetGroup, sec, idx) {
    var b = polyBounds(sec.polygon);
    if (b.w < 4 || b.h < 4) return;
    var cid = 'sm-st-' + idx + '-' + sec.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    var clip = svgEl('clipPath', { id: cid });
    clip.appendChild(svgEl('path', { d: polyToPath(sec.polygon) }));
    defs.appendChild(clip);
    var g = svgEl('g', { 'clip-path': 'url(#' + cid + ')', 'pointer-events': 'none' });
    var step = 5.5;
    if (b.h >= b.w * 0.9) {
      for (var y = b.minY + step; y < b.maxY - 1.5; y += step) {
        g.appendChild(svgEl('line', { x1: b.minX, y1: y.toFixed(1), x2: b.maxX, y2: y.toFixed(1), stroke: PALETTE.stairsTread, 'stroke-width': 1.3, opacity: 0.72 }));
      }
      g.appendChild(svgEl('line', { x1: ((b.minX + b.maxX) / 2).toFixed(1), y1: b.minY + 2, x2: ((b.minX + b.maxX) / 2).toFixed(1), y2: b.maxY - 2, stroke: PALETTE.stairsTread, 'stroke-width': 1.1, opacity: 0.5 }));
    } else {
      for (var x = b.minX + step; x < b.maxX - 1.5; x += step) {
        g.appendChild(svgEl('line', { x1: x.toFixed(1), y1: b.minY, x2: x.toFixed(1), y2: b.maxY, stroke: PALETTE.stairsTread, 'stroke-width': 1.3, opacity: 0.72 }));
      }
      g.appendChild(svgEl('line', { x1: b.minX + 2, y1: ((b.minY + b.maxY) / 2).toFixed(1), x2: b.maxX - 2, y2: ((b.minY + b.maxY) / 2).toFixed(1), stroke: PALETTE.stairsTread, 'stroke-width': 1.1, opacity: 0.5 }));
    }
    targetGroup.appendChild(g);
  }

  function appendSelectedLabel(labelLayer, sec) {
    var txt = sec.shortLabel || sec.roomNumber || sec.name || sec.id;
    var b = polyBounds(sec.polygon);
    var cx = sec.center[0], cy = sec.center[1];
    var fs = Math.max(10, Math.min(14, b.w * 0.23));
    var g = svgEl('g', { class: 'selected-sector-label', 'data-for-sector': sec.id, 'pointer-events': 'none' });
    var pillW = Math.max(txt.length * (fs * 0.78) + 12, 34);
    if (b.w >= pillW + 4 && b.h >= 22) {
      g.appendChild(svgEl('text', {
        x: cx, y: cy + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs.toFixed(1), 'font-weight': 800,
        fill: '#0f172a', stroke: '#ffffff', 'stroke-width': 3.2, 'paint-order': 'stroke',
        'font-family': 'Pretendard, Noto Sans KR, sans-serif',
      }, txt));
    } else {
      g.appendChild(svgEl('rect', { x: cx - pillW / 2, y: cy - 9, width: pillW, height: 18, rx: 9, fill: '#1d4ed8', stroke: '#ffffff', 'stroke-width': 1.5 }));
      g.appendChild(svgEl('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, txt));
    }
    labelLayer.appendChild(g);
  }

  function colorSector(svgOrContainer, sectorId, options) {
    var rootEl = svgOrContainer && svgOrContainer.querySelector ? (svgOrContainer.tagName && svgOrContainer.tagName.toLowerCase() === 'svg' ? svgOrContainer : svgOrContainer.querySelector('svg')) : null;
    if (!rootEl) return false;
    var path = rootEl.querySelector('[data-sector-id="' + sectorId + '"]');
    if (!path) return false;
    var opts = options || {};
    var fill = opts.fill || PALETTE.selectedFill;
    var stroke = opts.stroke || PALETTE.selectedStroke;
    var sw = opts.strokeWidth || 2.8;
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', stroke);
    path.setAttribute('stroke-width', String(sw));
    path.setAttribute('data-selected', 'true');

    var labelLayer = rootEl.querySelector('#layer-labels') || rootEl;
    var oldLbl = labelLayer.querySelector('.selected-sector-label[data-for-sector="' + sectorId + '"]');
    if (oldLbl && oldLbl.parentNode) oldLbl.parentNode.removeChild(oldLbl);
    if (opts.showLabel !== false) {
      var centerStr = path.getAttribute('data-center');
      var center = centerStr ? centerStr.split(',').map(Number) : null;
      if ((!center || center.length < 2 || isNaN(center[0])) && typeof path.getBBox === 'function') {
        try {
          var bb = path.getBBox();
          center = [bb.x + bb.width / 2, bb.y + bb.height / 2];
        } catch (e) { center = [0, 0]; }
      }
      if (!center || center.length < 2) center = [0, 0];
      var lblTxt = opts.label || path.getAttribute('data-room-number') || path.getAttribute('data-name') || sectorId;
      var g = svgEl('g', { class: 'selected-sector-label', 'data-for-sector': sectorId, 'pointer-events': 'none' });
      g.appendChild(svgEl('text', {
        x: center[0], y: center[1] + 4, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 800,
        fill: '#0f172a', stroke: '#ffffff', 'stroke-width': 3.2, 'paint-order': 'stroke',
        'font-family': 'Pretendard, Noto Sans KR, sans-serif',
      }, lblTxt));
      labelLayer.appendChild(g);
    }
    return true;
  }

  function clearHighlights(svgOrContainer) {
    var rootEl = svgOrContainer && svgOrContainer.querySelector ? (svgOrContainer.tagName && svgOrContainer.tagName.toLowerCase() === 'svg' ? svgOrContainer : svgOrContainer.querySelector('svg')) : null;
    if (!rootEl) return;
    var paths = rootEl.querySelectorAll('[data-selected="true"]');
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      p.removeAttribute('data-selected');
      var st = baseSectorStyle(p.getAttribute('data-type'));
      p.setAttribute('fill', st.fill);
      p.setAttribute('stroke', st.stroke);
      p.setAttribute('stroke-width', String(st.sw));
    }
    var oldLabels = rootEl.querySelectorAll('.selected-sector-label');
    for (var j = 0; j < oldLabels.length; j++) {
      if (oldLabels[j].parentNode) oldLabels[j].parentNode.removeChild(oldLabels[j]);
    }
  }

  function appendPinMarker(layer, x, y, text, fill) {
    var g = svgEl('g', { transform: 'translate(' + x + ',' + y + ')', 'pointer-events': 'none' });
    g.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 5, fill: '#ffffff', stroke: fill, 'stroke-width': 2.5 }));
    g.appendChild(svgEl('path', { d: 'M 0 -4 C -10 -15, -13 -28, 0 -34 C 13 -28, 10 -15, 0 -4 Z', fill: fill, stroke: '#ffffff', 'stroke-width': 1.8 }));
    g.appendChild(svgEl('text', { x: 0, y: -19, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 800, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, text));
    layer.appendChild(g);
  }

  function drawRoute(svgOrContainer, floorId, route, options) {
    var rootEl = svgOrContainer && svgOrContainer.querySelector ? (svgOrContainer.tagName && svgOrContainer.tagName.toLowerCase() === 'svg' ? svgOrContainer : svgOrContainer.querySelector('svg')) : null;
    if (!rootEl || !route || !route.ok) return null;
    var old = rootEl.querySelector('#layer-route');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var flKey = String(floorId || '').toUpperCase();
    var pts = route.polylinesByFloor && route.polylinesByFloor[flKey];
    var layer = svgEl('g', { id: 'layer-route', 'pointer-events': 'none' });
    if (pts && pts.length >= 2) {
      var ptsAttr = pts.map(function (pt) { return pt[0] + ',' + pt[1]; }).join(' ');
      layer.appendChild(svgEl('polyline', { points: ptsAttr, fill: 'none', stroke: PALETTE.routeCasing, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.94 }));
      layer.appendChild(svgEl('polyline', { points: ptsAttr, fill: 'none', stroke: PALETTE.routeStroke, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      for (var i = 0; i < pts.length - 1; i++) {
        var segLen = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        if (segLen >= 34) {
          var mx = (pts[i][0] + pts[i + 1][0]) / 2;
          var my = (pts[i][1] + pts[i + 1][1]) / 2;
          var ang = (Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) * 180) / Math.PI;
          var ag = svgEl('g', { transform: 'translate(' + mx.toFixed(1) + ',' + my.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')' });
          ag.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 7.5, fill: '#0070f3', stroke: '#ffffff', 'stroke-width': 1.5 }));
          ag.appendChild(svgEl('path', { d: 'M -2.5 -3.5 L 3 0 L -2.5 3.5', fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
          layer.appendChild(ag);
        }
      }
    }

    if (route.transfers) {
      for (var ti = 0; ti < route.transfers.length; ti++) {
        var tr = route.transfers[ti];
        if (tr.fromFloor === flKey || tr.toFloor === flKey) {
          var isFrom = tr.fromFloor === flKey;
          var sec = isFrom ? tr.fromSector : tr.toSector;
          var pos = sec ? sec.center : (isFrom ? tr.fromPos : tr.toPos);
          var badge = svgEl('g', { transform: 'translate(' + pos[0] + ',' + pos[1] + ')' });
          badge.appendChild(svgEl('rect', { x: -30, y: -24, width: 60, height: 18, rx: 6, fill: '#0f172a', stroke: '#ffffff', 'stroke-width': 1.4 }));
          badge.appendChild(svgEl('text', { x: 0, y: -11.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, isFrom ? '→ ' + tr.toFloor : tr.fromFloor + ' →'));
          layer.appendChild(badge);
        }
      }
    }

    var opts = options || {};
    if (opts.showPins !== false) {
      if (route.start && route.start.floor === flKey) appendPinMarker(layer, route.start.center[0], route.start.center[1], '출발', PALETTE.pinStart);
      if (route.end && route.end.floor === flKey) appendPinMarker(layer, route.end.center[0], route.end.center[1], '도착', PALETTE.pinEnd);
    }

    rootEl.appendChild(layer);
    return layer;
  }

  function render(containerOrNull, buildingData, floorId, options) {
    var fl = getFloor(buildingData, floorId);
    if (!fl) throw new Error('Unknown floor: ' + floorId);
    var opts = options || {};
    var vw = fl.viewBox[2], vh = fl.viewBox[3];
    var svg = svgEl('svg', {
      xmlns: SVG_NS,
      viewBox: '0 0 ' + vw + ' ' + vh,
      width: '100%',
      height: '100%',
      'data-building': buildingData.buildingId || '',
      'data-floor': fl.floor,
      style: 'display:block;width:100%;height:100%;user-select:none;',
    });

    svg.appendChild(svgEl('rect', { width: vw, height: vh, fill: PALETTE.canvasBg }));
    var defs = svgEl('defs');
    var pat = svgEl('pattern', { id: 'sm-hatch-open', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: '#94a3b8', 'stroke-width': 1.5, opacity: 0.5 }));
    defs.appendChild(pat);
    svg.appendChild(defs);

    var gShell = svgEl('g', { id: 'layer-shell-base' });
    for (var si = 0; si < fl.shellBoundary.length; si++) {
      gShell.appendChild(svgEl('path', { d: polyToPath(fl.shellBoundary[si]), fill: PALETTE.shellBg, stroke: 'none' }));
    }
    svg.appendChild(gShell);

    var gCorr = svgEl('g', { id: 'layer-corridors' });
    for (var ci = 0; ci < fl.corridorPolygons.length; ci++) {
      gCorr.appendChild(svgEl('path', { d: polyToPath(fl.corridorPolygons[ci]), fill: PALETTE.corridor, stroke: 'none' }));
    }
    svg.appendChild(gCorr);

    var hlSet = {};
    if (Array.isArray(opts.highlightedSectorIds)) {
      for (var hi = 0; hi < opts.highlightedSectorIds.length; hi++) hlSet[opts.highlightedSectorIds[hi]] = true;
    }

    var gSec = svgEl('g', { id: 'layer-sectors' });
    var gTreads = svgEl('g', { id: 'layer-stair-treads' });
    var gLabels = svgEl('g', { id: 'layer-labels', 'pointer-events': 'none' });

    for (var i = 0; i < fl.sectors.length; i++) {
      (function (sec, idx) {
        var isStart = opts.startSectorId === sec.id;
        var isEnd = opts.endSectorId === sec.id;
        var isSel = isStart || isEnd || !!hlSet[sec.id];
        var st = isSel ? { fill: isStart ? PALETTE.selectedStartFill : PALETTE.selectedFill, stroke: PALETTE.selectedStroke, sw: 2.8 } : baseSectorStyle(sec.type);

        var p = svgEl('path', {
          id: 'sector-' + sec.id,
          class: 'sector-path',
          d: polyToPath(sec.polygon),
          fill: st.fill,
          stroke: st.stroke,
          'stroke-width': st.sw,
          'stroke-linejoin': 'round',
          'data-sector-id': sec.id,
          'data-type': sec.type,
          'data-room-number': sec.roomNumber || '',
          'data-name': sec.name || '',
          'data-center': sec.center[0] + ',' + sec.center[1],
          'data-corridor-node': sec.corridorNodeId || '',
          'data-door-pos': sec.doorPos ? sec.doorPos[0] + ',' + sec.doorPos[1] : '',
          style: 'cursor:pointer;',
        });
        if (isSel) p.setAttribute('data-selected', 'true');
        if (typeof opts.onSectorClick === 'function') {
          p.addEventListener('click', function (ev) {
            ev.stopPropagation();
            opts.onSectorClick(sec, fl, ev);
          });
        }
        gSec.appendChild(p);

        if (sec.type === 'stairs') drawStairTreads(defs, gTreads, sec, idx);
        var b = polyBounds(sec.polygon);
        if (sec.type === 'restroom_men' || sec.type === 'restroom_women') {
          var fs = Math.max(8.5, Math.min(12.5, b.w * 0.34, b.h * 0.38));
          gLabels.appendChild(svgEl('text', { x: sec.center[0], y: sec.center[1] + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs.toFixed(1), 'font-weight': 800, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, sec.type === 'restroom_men' ? '♂ 남' : '♀ 여'));
        } else if (sec.type === 'elevator') {
          var rw = Math.min(22, Math.max(16, b.w * 0.6));
          gLabels.appendChild(svgEl('rect', { x: sec.center[0] - rw / 2, y: sec.center[1] - 7, width: rw, height: 14, rx: 3, fill: '#7c3aed' }));
          gLabels.appendChild(svgEl('text', { x: sec.center[0], y: sec.center[1] + 3.2, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 800, fill: '#ffffff', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, 'ELV'));
        } else if (isSel) {
          appendSelectedLabel(gLabels, sec);
        } else if (sec.type === 'void' && sec.shortLabel && b.w > 40 && b.h > 22) {
          gLabels.appendChild(svgEl('text', { x: sec.center[0], y: sec.center[1] + 4, 'text-anchor': 'middle', 'font-size': Math.min(13, b.w * 0.14).toFixed(1), 'font-weight': 700, fill: '#94a3b8', 'letter-spacing': 1.2, 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, sec.shortLabel));
        } else if ((sec.type === 'office' || sec.type === 'lounge' || sec.type === 'auditorium' || sec.type === 'facility') && sec.shortLabel && b.w >= 28 && b.h >= 18) {
          gLabels.appendChild(svgEl('text', { x: sec.center[0], y: sec.center[1] + 3.5, 'text-anchor': 'middle', 'font-size': Math.max(8, Math.min(10.5, b.w * 0.13)).toFixed(1), 'font-weight': 600, fill: '#334155', stroke: '#ffffff', 'stroke-width': 2, 'paint-order': 'stroke', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, sec.shortLabel));
        } else if (sec.type === 'classroom' && opts.showRoomLabels && sec.roomNumber && b.w >= 24 && b.h >= 16) {
          gLabels.appendChild(svgEl('text', { x: sec.center[0], y: sec.center[1] + 3.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: '#475569', 'font-family': 'Pretendard, Noto Sans KR, sans-serif' }, sec.roomNumber));
        }
      })(fl.sectors[i], i);
    }
    svg.appendChild(gSec);
    svg.appendChild(gTreads);

    var gOuter = svgEl('g', { id: 'layer-outer-wall', 'pointer-events': 'none' });
    for (var oi = 0; oi < fl.shellBoundary.length; oi++) {
      gOuter.appendChild(svgEl('path', { d: polyToPath(fl.shellBoundary[oi]), fill: 'none', stroke: PALETTE.outerWall, 'stroke-width': 7.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    svg.appendChild(gOuter);
    svg.appendChild(gLabels);

    if (opts.showCorridorGraph && fl.corridorGraph) {
      var gDebug = svgEl('g', { id: 'layer-corridor-graph', opacity: 0.45, 'pointer-events': 'none' });
      var nodes = fl.corridorGraph.nodes || {};
      var edges = fl.corridorGraph.edges || [];
      for (var ei = 0; ei < edges.length; ei++) {
        var u = nodes[edges[ei].from], v = nodes[edges[ei].to];
        if (u && v) gDebug.appendChild(svgEl('line', { x1: u.x, y1: u.y, x2: v.x, y2: v.y, stroke: '#0ea5e9', 'stroke-width': 1.8 }));
      }
      svg.appendChild(gDebug);
    }

    if (opts.route && opts.route.ok) drawRoute(svg, fl.floor, opts.route, opts);

    if (containerOrNull && containerOrNull.appendChild) {
      containerOrNull.innerHTML = '';
      containerOrNull.appendChild(svg);
    }
    return svg;
  }

  return {
    PALETTE: PALETTE,
    loadCatalog: loadCatalog,
    loadBuilding: loadBuilding,
    getFloorIds: getFloorIds,
    getFloor: getFloor,
    listSectors: listSectors,
    findSector: findSector,
    findCorridorRoute: findCorridorRoute,
    colorSector: colorSector,
    clearHighlights: clearHighlights,
    drawRoute: drawRoute,
    render: render,
  };
}));
