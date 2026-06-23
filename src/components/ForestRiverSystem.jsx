import { useEffect, useRef, useState } from "react";

const formatDistance = (distance) => {
    if (!Number.isFinite(distance)) return "—";
    if (distance >= 1000) {
        return `${(distance / 1000).toFixed(2)} km`;
    }
    return `${Math.round(distance)} m`;
};

const ForestRiverSystem = ({ metricsRef, ready = false }) => {
    const [metrics, setMetrics] = useState(null);
    const lastKeyRef = useRef("");

    useEffect(() => {
        if (!ready) {
            setMetrics(null);
            return undefined;
        }

        let frame = 0;

        const tick = () => {
            frame = requestAnimationFrame(tick);
            const next = metricsRef.current;
            if (!next) return;

            const key = [
                Math.round(next.distance),
                Math.round(next.riverX),
                Math.round(next.riverZ),
                Math.round(next.relativeBearing * 100),
                Math.round(next.alignment * 100),
                Math.round(next.navigationGain * 100),
            ].join(":");

            if (key !== lastKeyRef.current) {
                lastKeyRef.current = key;
                setMetrics(next);
            }
        };

        tick();

        return () => cancelAnimationFrame(frame);
    }, [metricsRef, ready]);

    if (!ready || !metrics) return null;

    const markerX = 50 + metrics.radarX * 38;
    const markerY = 50 + metrics.radarY * 38;

    return (
        <div className="forest-river-system" aria-live="polite">
            <p className="forest-river-system__label">River source</p>
            <div className="forest-river-system__radar" aria-hidden="true">
                <div className="forest-river-system__ring forest-river-system__ring--outer" />
                <div className="forest-river-system__ring forest-river-system__ring--inner" />
                <div className="forest-river-system__axis forest-river-system__axis--x" />
                <div className="forest-river-system__axis forest-river-system__axis--z" />
                <div className="forest-river-system__player" />
                <div
                    className="forest-river-system__marker"
                    style={{
                        left: `${markerX}%`,
                        top: `${markerY}%`,
                    }}
                />
            </div>
            <dl className="forest-river-system__stats">
                <div className="forest-river-system__stat">
                    <dt>Distance</dt>
                    <dd>{formatDistance(metrics.distance)}</dd>
                </div>
                <div className="forest-river-system__stat">
                    <dt>Position</dt>
                    <dd>
                        {Math.round(metrics.riverX)}, {Math.round(metrics.riverZ)}
                    </dd>
                </div>
                <div className="forest-river-system__stat">
                    <dt>Facing</dt>
                    <dd>{Math.round(Math.max(0, metrics.alignment) * 100)}%</dd>
                </div>
                <div className="forest-river-system__stat">
                    <dt>Gain</dt>
                    <dd>{Math.round(metrics.navigationGain * 100)}%</dd>
                </div>
            </dl>
        </div>
    );
};

export default ForestRiverSystem;
