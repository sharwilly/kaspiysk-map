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
                // At city scale clusters should be useful, but not swallow half the map.
                maxClusterRadius: zoom => {
                    if (zoom <= 12) return 42;
                    if (zoom === 13) return 34;
                    if (zoom === 14) return 26;
                    if (zoom === 15) return 18;
                    if (zoom === 16) return 12;
                    return 8;
                },
                // Keep clustering almost to street level. This also lets spiderfy work
                // for trucks that are very close to each other.
                disableClusteringAtZoom: 17,
                spiderfyOnMaxZoom: true,
                spiderfyDistanceMultiplier: 1.15,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                animate: true,
                iconCreateFunction(cluster) {
                    const count = cluster.getChildCount();
                    const size = count < 5 ? "small" : count < 10 ? "medium" : "large";
                    return L.divIcon({
                        className: `truck-cluster truck-cluster-${size}`,
                        html: `<span>${count}</span>`,
                        iconSize: [42, 42],
                        iconAnchor: [21, 21]
                    });
                }
            });
            map.addLayer(truckClusterGroup);
        }
        return truckClusterGroup;
    }

    // trucks.js uses marker.addTo(map), so route only those markers through the
    // cluster group without changing marker behaviour on other pages.
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
            background: rgba(255,255,255,.90);
            border: 1px solid rgba(37,99,235,.18);
            box-shadow: 0 8px 24px rgba(15,23,42,.14), inset 0 0 0 4px rgba(37,99,235,.07);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            transition: transform .16s ease;
        }
        .truck-cluster span {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: #2563eb;
            color: #fff;
            font: 700 12px/1 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 3px 10px rgba(37,99,235,.24);
        }
        .truck-cluster-medium span { background: #0f766e; }
        .truck-cluster-large span { background: #7c3aed; }
        .truck-cluster:hover { transform: scale(1.06); }
    `;
    document.head.appendChild(style);
});
