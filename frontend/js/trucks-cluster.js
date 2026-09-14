document.addEventListener("DOMContentLoaded", () => {
    if (!window.L?.MarkerClusterGroup || !L.Marker?.prototype?.addTo || !L.Map?.prototype?.removeLayer) return;

    const originalMarkerAddTo = L.Marker.prototype.addTo;
    const originalMapRemoveLayer = L.Map.prototype.removeLayer;
    let truckClusterGroup = null;

    function isTruckMap(map) {
        return map?.getContainer?.()?.id === "trucks-map";
    }

    function getTruckClusterGroup(map) {
        if (!truckClusterGroup) {
            truckClusterGroup = L.markerClusterGroup({
                maxClusterRadius: 55,
                disableClusteringAtZoom: 15,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                animate: true,
                iconCreateFunction(cluster) {
                    const count = cluster.getChildCount();
                    const size = count < 10 ? "small" : count < 30 ? "medium" : "large";
                    return L.divIcon({
                        className: `truck-cluster truck-cluster-${size}`,
                        html: `<span>${count}</span>`,
                        iconSize: [44, 44],
                        iconAnchor: [22, 22]
                    });
                }
            });
            map.addLayer(truckClusterGroup);
        }
        return truckClusterGroup;
    }

    L.Marker.prototype.addTo = function (map) {
        if (isTruckMap(map)) {
            getTruckClusterGroup(map).addLayer(this);
            return this;
        }
        return originalMarkerAddTo.call(this, map);
    };

    L.Map.prototype.removeLayer = function (layer) {
        if (isTruckMap(this) && truckClusterGroup?.hasLayer(layer)) {
            truckClusterGroup.removeLayer(layer);
            return this;
        }
        return originalMapRemoveLayer.call(this, layer);
    };

    const style = document.createElement("style");
    style.textContent = `
        .truck-cluster {
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: rgba(255,255,255,.88);
            border: 1px solid rgba(37,99,235,.24);
            box-shadow: 0 8px 24px rgba(15,23,42,.16), inset 0 0 0 5px rgba(37,99,235,.08);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }
        .truck-cluster span {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: #2563eb;
            color: #fff;
            font: 700 13px/1 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 3px 10px rgba(37,99,235,.28);
        }
        .truck-cluster-medium span { background: #0f766e; }
        .truck-cluster-large span { background: #7c3aed; }
        .truck-cluster:hover { transform: scale(1.05); }
    `;
    document.head.appendChild(style);
});
