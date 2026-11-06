# Scoped suggestion preferences

Use setAIPolicyPreference and evaluateAIPreferenceGate to control frequency, cooldown, blocked proposals, tone and target in scoped memory. Synchronous policies apply gates automatically. Accepted feedback resets the dismissal streak; reset ignores older feedback while keeping history. Async callers should check the gate before paid generation. Preferences persist through the configured memory adapter. Tone and target must be explicitly borrowed and validated by the app.
