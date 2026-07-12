// ═══════════════════════════════════════════════════════════════════════════
// PROMPT.JS — Turns the current results into the final English sentence, the copy-to-clipboard
// button, and the prompt history stack (including the drag/click card-swipe navigation).
// ═══════════════════════════════════════════════════════════════════════════

// ─── PROMPT HISTORY ─────────────────────────────────────────────────────────
// Every full spin and every reroll pushes a snapshot onto a small undo/redo-style stack.
// Dragging the prompt card left/right (or using the ‹ › buttons / arrow keys) moves through it.

        // Takes a snapshot of the current live state and pushes it onto the history stack.
        // Skips pushing if nothing actually changed since the last entry (avoids no-op duplicates).
        function pushHistorySnapshot() {
            if (!sectionKeys.some(k => enabledSections[k] && currentResults[k].length > 0)) return;
            const snapshot = {
                currentResults: JSON.parse(JSON.stringify(currentResults)),
                lockedState: JSON.parse(JSON.stringify(lockedState)),
                enabledSections: JSON.parse(JSON.stringify(enabledSections)),
                promptHTML: document.getElementById('finalPrompt').innerHTML
            };
            const last = promptHistory[promptHistory.length - 1];
            if (last && JSON.stringify(last) === JSON.stringify(snapshot)) { historyIndex = promptHistory.length - 1; updateHistoryNavUI(); return; }
            // If we'd navigated back into the past and then made a fresh change, drop the abandoned "future" branch.
            if (historyIndex < promptHistory.length - 1) promptHistory = promptHistory.slice(0, historyIndex + 1);
            promptHistory.push(snapshot);
            if (promptHistory.length > MAX_HISTORY) promptHistory.shift();
            historyIndex = promptHistory.length - 1;
            updateHistoryNavUI();
        }

        // Restores a given point in history as the live, editable state (locks/rerolls still work from there).
        function goToHistoryIndex(newIndex) {
            if (newIndex < 0 || newIndex >= promptHistory.length || newIndex === historyIndex) return;
            historyIndex = newIndex;
            const snap = promptHistory[historyIndex];
            currentResults = JSON.parse(JSON.stringify(snap.currentResults));
            lockedState = JSON.parse(JSON.stringify(snap.lockedState));
            sectionKeys.forEach(k => {
                enabledSections[k] = snap.enabledSections[k];
                const toggle = document.getElementById(`toggle-${k}`); const row = document.getElementById(`row-${k}`);
                if (toggle) toggle.checked = enabledSections[k];
                if (row) row.classList.toggle('active', enabledSections[k]);
            });
            renderAllCards(false);
            document.getElementById('finalPrompt').innerHTML = snap.promptHTML;
            document.getElementById('promptBox').style.display = 'block';
            updateHistoryNavUI();
            updateSpinAvailability();
            saveState();
        }

        function goToPrevPrompt() { goToHistoryIndex(historyIndex - 1); }

        function goToNextPrompt() { goToHistoryIndex(historyIndex + 1); }

        // Updates the "‹  3 of 7  ›" indicator under the prompt, hiding it entirely until there's
        // more than one prompt to navigate between, and disabling arrows at either end of the stack.
        function updateHistoryNavUI() {
            const nav = document.getElementById('historyNav');
            if (!nav) return;
            if (promptHistory.length <= 1) { nav.style.display = 'none'; return; }
            nav.style.display = 'flex';
            document.getElementById('historyPosition').textContent = `${historyIndex + 1} of ${promptHistory.length}`;
            document.getElementById('historyPrevBtn').disabled = historyIndex <= 0;
            document.getElementById('historyNextBtn').disabled = historyIndex >= promptHistory.length - 1;
        }

        // Click-to-navigate: clicking the left half of the card goes to the previous prompt, the right
        // half goes to the next. Each click nudges the card toward the clicked side, briefly dips and
        // shrinks (as if tucking under the card behind it), then the neighboring prompt rises back up
        // into place — the same motion mirrored for either side. Arrow keys do the same thing.
        function initPromptNav() {
            const box = document.getElementById('promptBox');
            if (!box) return;

            box.addEventListener('click', e => {
                if (e.target.closest('.copy-btn, .history-nav-btn')) return; // let those buttons work normally
                const rect = box.getBoundingClientRect();
                const clickedLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                nudgeAndReveal(clickedLeftHalf ? 'prev' : 'next', clickedLeftHalf ? -1 : 1);
            });

            // `nudgeSign` is -1 for left, 1 for right — controls which way the card nudges/dips,
            // independent of `direction` (which history entry it navigates to).
            function nudgeAndReveal(direction, nudgeSign) {
                const canGo = direction === 'prev' ? historyIndex > 0 : historyIndex < promptHistory.length - 1;
                if (!canGo) {
                    // Nothing further that way — a small bump communicates "end of history" without navigating.
                    SoundFX.bump();
                    box.style.transform = `translateX(${nudgeSign * 12}px)`;
                    requestAnimationFrame(() => { box.style.transform = 'translateX(0)'; });
                    return;
                }
                SoundFX.whoosh();
                const outNudge = nudgeSign * 26;
                const dipNudge = nudgeSign * 10;

                box.style.transform = `translateX(${outNudge}px)`;
                setTimeout(() => {
                    box.style.transition = 'transform 0.14s ease-in, opacity 0.14s ease-in';
                    box.style.transform = `translateX(${dipNudge}px) scale(0.96)`;
                    box.style.opacity = '0.55';
                    setTimeout(() => {
                        if (direction === 'prev') goToPrevPrompt(); else goToNextPrompt();
                        // Content is now swapped while hidden mid-dip. Hold that dipped position with no
                        // transition, then let it rise back to full size/position — "appearing from underneath".
                        box.style.transition = 'none';
                        box.style.transform = `translateX(${dipNudge}px) scale(0.96)`;
                        box.style.opacity = '0.55';
                        void box.offsetWidth; // force reflow
                        box.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease';
                        requestAnimationFrame(() => { box.style.transform = 'translateX(0) scale(1)'; box.style.opacity = '1'; });
                    }, 140);
                }, 110);
            }

            // Keyboard equivalent: focus the prompt card, then use the arrow keys — same animation as a click.
            box.setAttribute('tabindex', '0');
            box.setAttribute('aria-label', 'Generated prompt. Click the left or right side, or use the arrow keys, to browse previous prompts.');
            box.addEventListener('keydown', e => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeAndReveal('prev', -1); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeAndReveal('next', 1); }
            });
        }

        // Builds and displays the final prompt sentence from whatever is currently rolled.
        // Sorts themes into three buckets (standard / vibes / inspirations) and handles SCAMPER keywords.
        // Called after every spin or reroll.
        function generatePromptSentence() {
    const promptBox   = document.getElementById('promptBox');
    const finalPrompt = document.getElementById('finalPrompt');
    if (!sectionKeys.some(k => enabledSections[k] && currentResults[k].length > 0)) {
        promptBox.style.display = 'none';
        return;
    }


    const mechanicNames = (enabledSections.mechanics && currentResults.mechanics.length > 0)
        ? currentResults.mechanics.map(m => m.name)
        : [];

    // Classify themes
    const standardThemes = [];
    const vibes          = [];
    const inspirations   = [];
    let   scamperKey     = null;

    if (enabledSections.themes && currentResults.themes.length > 0) {
        currentResults.themes.forEach(({ name }) => {
            const matchedScamper = Object.keys(SCAMPER).find(
                k => k.toLowerCase() === name.toLowerCase()
            );
            if (matchedScamper)         scamperKey = matchedScamper;
            else if (VIBES_SET.has(name))        vibes.push(name);
            else if (INSPIRATION_SET.has(name))  inspirations.push(name);
            else                                 standardThemes.push(name);
        });
    }

    // Build components
    const useItems     = [];
    const withoutItems = [];
    if (enabledSections.components && currentResults.components.length > 0) {
        currentResults.components.forEach(c => {
            if (c.rule === 'use') useItems.push(c.name);
            else                  withoutItems.push(c.name);
        });
    }

    // Assemble sentence parts
    const parts = [];

    // Theme clause: standard themes read as "about X", vibes read as "with a Tense tone"
    // (a single shared "tone" noun even when several vibes are rolled together, e.g.
    // "with a Tense and Strategic tone" rather than "a Tense tone and a Strategic tone").
    // When both kinds are rolled, they're joined as two clauses: "about X, with a Y tone".
    const themeClauses = [];
    if (standardThemes.length > 0) themeClauses.push(`about ${joinList(standardThemes.map(h))}`);
    if (vibes.length > 0)          themeClauses.push(`with a ${joinList(vibes.map(h))} tone`);
    if (themeClauses.length > 0)   parts.push(themeClauses.join(', '));

    if (mechanicNames.length > 0) {
        const word = mechanicNames.length === 1 ? 'mechanic' : 'mechanics';
        parts.push(`featuring ${joinList(mechanicNames.map(h))} ${word}`);
    }

    const compParts = [];
    if (useItems.length > 0)     compParts.push(`using ${joinList(useItems.map(h))}`);
    if (withoutItems.length > 0) compParts.push(`without ${joinList(withoutItems.map(h))}`);
    if (compParts.length > 0)    parts.push(compParts.join(', '));

    // Nothing for a "Design a game ..." sentence — but an inspiration word or a SCAMPER
    // prompt can still stand on its own (e.g. themes section rolled only an Inspiration
    // word, with no standard/vibe theme, mechanic, or component to build a clause from).
    if (parts.length === 0 && inspirations.length === 0 && !scamperKey) {
        promptBox.style.display = 'none';
        return;
    }

    // Join parts with "while" before the component clause (matching original grammar)
    let out = '';
    if (parts.length === 1) {
        out = `design a game ${parts[0]}.`;
    } else if (parts.length === 2) {
        out = `design a game ${parts[0]} ${parts[1]}.`;
    } else if (parts.length > 2) {
        // "while" only reads naturally in front of a participle clause ("while using X").
        // If the trailing clause has no "using" items — e.g. it's a lone "without Y" —
        // fall back to "and" so it doesn't come out as "while without Y".
        const lastPart = parts[parts.length - 1];
        const joiner = /^using\b/.test(lastPart) ? 'while' : 'and';
        out = `design a game ${parts.slice(0, -1).join(', ')}, ${joiner} ${lastPart}.`;
    }

    // Word inspirations as a separate sentence
    if (inspirations.length > 0) {
        const sentence = `Use ${joinList(inspirations.map(w => `the word ${h(w)}`))} to inspire you.`;
        out = out ? `${out} ${sentence}` : sentence;
    }

    // SCAMPER question appended last
    if (scamperKey) {
        const m1 = mechanicNames[0] || '';
        const m2 = mechanicNames[1] || m1;
        const sentence = m1
            ? SCAMPER[scamperKey](m1, m2)
            : `Apply ${h(scamperKey)} to your game design.`;
        out = out ? `${out} ${sentence}` : sentence;
    }

    finalPrompt.innerHTML = out.charAt(0).toUpperCase() + out.slice(1);
    promptBox.style.display = 'block';

    const copyBtn = document.getElementById('copyBtn');
    copyBtn.classList.remove('copied');
    copyBtn.textContent = 'Copy prompt';
}

        // Copies the plain-text version of the prompt to the clipboard and briefly shows "Copied!".
        function copyPrompt() {
            const text = document.getElementById('finalPrompt').textContent;
            const copyBtn = document.getElementById('copyBtn');
            function showCopied() { copyBtn.textContent = 'Copied!'; copyBtn.classList.add('copied'); SoundFX.copy(); setTimeout(() => { copyBtn.textContent = 'Copy prompt'; copyBtn.classList.remove('copied'); }, 1600); }
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(showCopied).catch(() => fallbackCopy(text, showCopied)); }
            else { fallbackCopy(text, showCopied); }
        }

        // Older clipboard fallback for browsers that don't support navigator.clipboard.
        function fallbackCopy(text, onSuccess) {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); onSuccess(); } catch (e) {} document.body.removeChild(ta);
        }
