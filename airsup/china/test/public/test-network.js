/**
 * /airsup/china/test network — same vis.js options & interaction as public bookshelf.js
 */
(function (global) {
  'use strict';

  var network = null;
  var nodesDataSet = null;
  var edgesDataSet = null;
  var lastZoomUpdate = 0;
  var baseNodeSize = 40;

  function getEdgeColor() {
    return {
      color: 'rgba(26, 26, 26, 0.1)',
      highlight: 'rgba(193, 106, 40, 0.3)',
    };
  }

  /** Portrait “cover” card — bookshelf uses book images; dumps get a text cover. */
  function coverDataUrl(node) {
    var w = 240;
    var h = 320;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F7F1E7';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(193, 106, 40, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Accent stripe like a book spine feel
    ctx.fillStyle = 'rgba(193, 106, 40, 0.85)';
    ctx.fillRect(0, 0, 14, h);

    var kind = String(node.kind || 'note').toUpperCase();
    ctx.fillStyle = 'rgba(26, 26, 26, 0.45)';
    ctx.font = '600 18px Georgia, "Songti SC", serif';
    ctx.fillText(kind.slice(0, 12), 28, 48);

    var label = String(node.label || '');
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '500 28px Georgia, "Songti SC", "Noto Serif SC", serif';
    wrapText(ctx, label, 28, 100, w - 48, 34, 6);

    if (node.detail && node.detail !== label) {
      ctx.fillStyle = 'rgba(26, 26, 26, 0.55)';
      ctx.font = '400 16px Georgia, "Songti SC", serif';
      wrapText(ctx, String(node.detail), 28, 240, w - 48, 22, 3);
    }
    return canvas.toDataURL('image/png');
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) {
      // CJK without spaces — chunk by chars
      words = String(text || '').split('');
    }
    var line = '';
    var lines = 0;
    for (var n = 0; n < words.length; n++) {
      var test = line + words[n] + (words[n].length === 1 && /[\u4e00-\u9fff]/.test(words[n]) ? '' : ' ');
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, y);
        line = words[n] + (words[n].length === 1 ? '' : ' ');
        y += lineHeight;
        lines += 1;
        if (lines >= maxLines - 1) {
          var rest = words.slice(n).join(words[n].length === 1 ? '' : ' ');
          if (ctx.measureText(rest).width > maxWidth) {
            while (rest.length && ctx.measureText(rest + '…').width > maxWidth) rest = rest.slice(0, -1);
            rest += '…';
          }
          ctx.fillText(rest, x, y);
          return;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line.trim(), x, y);
  }

  function toVisNode(node) {
    return {
      id: node.id,
      shape: 'image',
      image: coverDataUrl(node),
      size: baseNodeSize,
      shapeProperties: {
        useImageSize: false,
        useBorderWithImage: true,
        interpolation: true,
      },
      borderWidth: 2,
      borderWidthSelected: 4,
      color: {
        border: 'rgba(193, 106, 40, 0.3)',
        highlight: { border: '#C16A28' },
      },
      noteData: node,
    };
  }

  function toVisEdge(edge, idx) {
    var color = getEdgeColor();
    return {
      id: edge.id || ('e_' + edge.from + '_' + edge.to + '_' + idx),
      from: edge.from,
      to: edge.to,
      color: color,
      width: 1,
      smooth: { type: 'continuous' },
    };
  }

  function networkOptions() {
    // Copied from public/js/bookshelf.js — keep in sync
    return {
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 300,
          updateInterval: 25,
        },
        barnesHut: {
          gravitationalConstant: -5000,
          centralGravity: 0.05,
          springLength: 250,
          springConstant: 0.015,
          damping: 0.15,
          avoidOverlap: 1,
        },
      },
      interaction: {
        zoomView: true,
        dragView: true,
        hover: true,
        tooltipDelay: 300,
        hideEdgesOnDrag: false,
        hideEdgesOnZoom: false,
        zoomSpeed: 0.5,
      },
      nodes: {
        borderWidth: 2,
        borderWidthSelected: 4,
        shape: 'image',
        size: 40,
        shapeProperties: {
          useImageSize: false,
          interpolation: true,
        },
        scaling: {
          min: 10,
          max: 150,
          label: { enabled: false },
        },
      },
      edges: {
        scaling: { min: 1, max: 3 },
      },
    };
  }

  function bindZoomBehavior() {
    lastZoomUpdate = 0;
    network.on('zoom', function () {
      var scale = network.getScale();
      var updates = [];
      nodesDataSet.forEach(function (node) {
        var nodeSize = baseNodeSize * Math.pow(scale, 0.12);
        updates.push({ id: node.id, size: Math.min(nodeSize, 65) });
      });
      nodesDataSet.update(updates);

      var now = Date.now();
      if (now - lastZoomUpdate > 100) {
        lastZoomUpdate = now;
        var dynamicSpacing = 250 * Math.pow(scale, 0.4);
        network.setOptions({
          physics: {
            enabled: true,
            barnesHut: {
              springLength: dynamicSpacing,
              springConstant: 0.001,
              damping: 0.9,
              avoidOverlap: 1,
            },
          },
        });
        setTimeout(function () {
          network.stopSimulation();
        }, 60);
      }
    });
  }

  function mount(container, web, handlers) {
    handlers = handlers || {};
    var nodes = Object.values((web && web.nodes) || {});
    var edges = (web && web.edges) || [];

    if (network) {
      network.destroy();
      network = null;
    }

    if (!nodes.length) {
      nodesDataSet = null;
      edgesDataSet = null;
      container.innerHTML = '';
      return null;
    }

    nodesDataSet = new vis.DataSet(nodes.map(toVisNode));
    edgesDataSet = new vis.DataSet(edges.map(toVisEdge));
    network = new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, networkOptions());
    bindZoomBehavior();
    network.once('stabilizationIterationsDone', function () {
      network.setOptions({ physics: false });
    });

    network.on('click', function (params) {
      if (params.nodes.length > 0) {
        var id = params.nodes[0];
        var row = nodesDataSet.get(id);
        if (handlers.onSelect) handlers.onSelect(row && row.noteData, id);
        network.selectNodes([id], false);
      } else if (handlers.onDeselect) {
        handlers.onDeselect();
      }
    });
    network.on('doubleClick', function () {
      if (handlers.onDeselect) handlers.onDeselect();
    });

    return network;
  }

  /** Incremental grow like adding a book — add nodes/edges then briefly re-physics. */
  function syncWeb(web) {
    if (!network || !nodesDataSet) {
      return false;
    }
    var nodes = Object.values((web && web.nodes) || {});
    var edges = (web && web.edges) || [];
    var existing = {};
    nodesDataSet.forEach(function (n) { existing[n.id] = true; });

    var toAdd = [];
    var toUpdate = [];
    nodes.forEach(function (node) {
      if (existing[node.id]) {
        toUpdate.push(toVisNode(node));
      } else {
        toAdd.push(toVisNode(node));
      }
    });
    if (toAdd.length) nodesDataSet.add(toAdd);
    if (toUpdate.length) nodesDataSet.update(toUpdate);

    var edgeExisting = {};
    edgesDataSet.forEach(function (e) {
      edgeExisting[e.from + '::' + e.to] = true;
      edgeExisting[e.to + '::' + e.from] = true;
    });
    var newEdges = [];
    edges.forEach(function (e, i) {
      var k = e.from + '::' + e.to;
      if (edgeExisting[k]) return;
      newEdges.push(toVisEdge(e, i));
      edgeExisting[k] = true;
    });
    if (newEdges.length) edgesDataSet.add(newEdges);

    if (toAdd.length || newEdges.length) {
      network.setOptions({ physics: { enabled: true } });
      network.stabilize(120);
      network.once('stabilizationIterationsDone', function () {
        network.setOptions({ physics: false });
      });
    }
    return true;
  }

  function destroy() {
    if (network) {
      network.destroy();
      network = null;
    }
    nodesDataSet = null;
    edgesDataSet = null;
  }

  global.AirsupChinaTestNetwork = {
    mount: mount,
    syncWeb: syncWeb,
    destroy: destroy,
    coverDataUrl: coverDataUrl,
  };
})(typeof window !== 'undefined' ? window : global);
