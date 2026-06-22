const ForestDarkControls = ({ value = 0, onChange, ready = false }) => {
    const percent = Math.round(value * 100);

    return (
        <div
            className={`forest-dark${ready ? " forest-dark--ready" : ""}`}
            aria-hidden={!ready}
        >
            <label className="forest-dark__label" htmlFor="forest-dark-slider">
                Darkness
                <span className="forest-dark__value">{percent}%</span>
            </label>
            <div className="forest-dark__track">
                <div
                    className="forest-dark__bar"
                    style={{ width: `${percent}%` }}
                />
                <input
                    id="forest-dark-slider"
                    className="forest-dark__slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={percent}
                    disabled={!ready}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label="Darkness level"
                    onChange={(event) => {
                        onChange?.(Number(event.target.value) / 100);
                    }}
                />
            </div>
        </div>
    );
};

export default ForestDarkControls;
