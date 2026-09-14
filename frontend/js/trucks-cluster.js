(() => {
    if (!window.L?.MarkerClusterGroup) return;

    const originalMarkerAddTo = L.Marker.prototype.addTo;
    const originalMarkerSetOpacity = L.Marker.prototype.setOpacity;
    const originalMapRemoveLayer = L.Map.prototype.removeLayer;
    const groups = new WeakMap();

    function isTruckMap(map) {
        return map?.getContainer?.()?.id === "trucks-map";
    }

    function radiusForZoom(zoom) {
        if (zoom >= 17) return 0;
        if (zoom >= 16) return 18;
        if (zoom >= 15) return 28;
        if (zoom >= 14) return 38;
        if (zoom >= 13) return 48;
        return 58;
    }

    function getTruckClusterGroup(map) {
        let group = groups.get(map);
        if (group) return group;

        group = L.markerClusterGroup({
            maxClusterRadius: radiusForZoom,
            disableClusteringAtZoom: 17,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyDistanceMultiplier: 1.25,
            spiderLegPolylineOptions: {
                weight: 1.5,
                opacity: 0.35
            },
            animate: true,
            animateAddingMarkers: false,
            removeOutsideVisibleBounds: true,
            iconCreateFunction(cluster) {
                const count = cluster.getChildCount();
                const size = count < 5 ? 42 : count < 10 ? 46 : 50;
                return L.divIcon({
                    className: "truck-cluster",
                    html: `<span>${count}</span>`,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2]
                });
            }
        });

        groups.set(map, group);
        map.addLayer(group);
        return group;
    }

    // This file is loaded before trucks.js. Patch immediately, not on
    // DOMContentLoaded, otherwise trucks.js creates ordinary map markers first.
    L.Marker.prototype.addTo = function (map) {
        if (!isTruckMap(map)) return originalMarkerAddTo.call(this, map);

        const group = getTruckClusterGroup(map);
        this.__truckClusterManaged = true;
        this.__truckClusterGroup = group;
        if (this.options.opacity !== 0) group.addLayer(this);
        return this;
    };

    // Route mode in trucks.js hides non-selected vehicles with setOpacity(0).
    // Remove hidden vehicles from the cluster completely so they cannot keep
    // the selected truck inside a cluster or inflate the cluster count.
    L.Marker.prototype.setOpacity = function (opacity) {
        if (!this.__truckClusterManaged) {
            return originalMarkerSetOpacity.call(this, opacity);
        }

        const group = this.__truckClusterGroup;
        const next = Number(opacity);
        if (!group || !Number.isFinite(next)) {
            return originalMarkerSetOpacity.call(this, opacity);
        }

        if (next <= 0) {
            if (group.hasLayer(this)) group.removeLayer(this);
            this.options.opacity = 0;
            return this;
        }

        this.options.opacity = next;
        if (!group.hasLayer(this)) group.addLayer(this);
        return this;
    };

    L.Map.prototype.removeLayer = function (layer) {
        if (isTruckMap(this) && layer?.__truckClusterManaged) {
            const group = layer.__truckClusterGroup;
            if (group?.hasLayer(layer)) group.removeLayer(layer);
            return this;
        }
        return originalMapRemoveLayer.call(this, layer);
    };

    const style = document.createElement("style");
    style.textContent = `
        .truck-cluster {
            display: grid;
            place-items: center;
            border-radius: 50%;
            background: rgba(255,255,255,.92);
            border: 1px solid rgba(37,99,235,.20);
            box-shadow: 0 10px 28px rgba(15,23,42,.16), inset 0 0 0 5px rgba(37,99,235,.07);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            transition: transform .16s ease;
        }
        .truck-cluster span {
            width: 32px;
            height: 32px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            background: #2563eb;
            color: #fff;
            font: 700 12px/1 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 4px 12px rgba(37,99,235,.25);
        }
        .truck-cluster:hover { transform: scale(1.06); }
    `;
    document.head.appendChild(style);
})();
