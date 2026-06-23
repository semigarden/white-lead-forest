const ForestDarkControls = ({ value = 0, ready = false }) => {
    const percent = Math.round(value * 100);

    return (
        <div
            className={`forest-dark${ready ? " forest-dark--ready" : ""}`}
            aria-hidden={!ready}
        >
            <label className="forest-dark__label">
                Darkness
                <span className="forest-dark__value">{percent}%</span>
            </label>
            <div
                className="forest-dark__track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Darkness level"
            >
                <div
                    className="forest-dark__bar"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

export default ForestDarkControls;
