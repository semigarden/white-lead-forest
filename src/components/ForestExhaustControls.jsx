const ForestExhaustControls = ({ value = 0, onChange, ready = false }) => {
    const percent = Math.round(value * 100);

    return (
        <div
            className={`forest-exhaust${ready ? " forest-exhaust--ready" : ""}`}
            aria-hidden={!ready}
        >
            <label className="forest-exhaust__label" htmlFor="forest-exhaust-slider">
                Exhaust
                <span className="forest-exhaust__value">{percent}%</span>
            </label>
            <div className="forest-exhaust__track">
                <div
                    className="forest-exhaust__bar"
                    style={{ width: `${percent}%` }}
                />
                <input
                    id="forest-exhaust-slider"
                    className="forest-exhaust__slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={percent}
                    disabled={!ready}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label="Exhaust level"
                    onChange={(event) => {
                        onChange?.(Number(event.target.value) / 100);
                    }}
                />
            </div>
        </div>
    );
};

export default ForestExhaustControls;
