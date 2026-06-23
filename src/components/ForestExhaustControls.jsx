const ForestExhaustControls = ({ value = 0, ready = false }) => {
    const percent = Math.round(value * 100);

    return (
        <div
            className={`forest-exhaust${ready ? " forest-exhaust--ready" : ""}`}
            aria-hidden={!ready}
        >
            <label className="forest-exhaust__label">
                Exhaust
                <span className="forest-exhaust__value">{percent}%</span>
            </label>
            <div
                className="forest-exhaust__track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Exhaust level"
            >
                <div
                    className="forest-exhaust__bar"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

export default ForestExhaustControls;
