(() => {
  "use strict";

  const records = Array.isArray(window.REPRINTS_DATA) ? window.REPRINTS_DATA : [];
  const state = { search: "", year: "", journal: "", medicine: "", purpose: "", sort: "newest", limit: 12 };
  let deferredInstallPrompt = null;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    gate: $("#professionalGate"), gateYes: $("#professionalGateYes"), gateNo: $("#professionalGateNo"),
    gateClose: $("#professionalGateClose"),
    grid: $("#cardGrid"), template: $("#cardTemplate"), count: $("#resultCount"), shown: $("#shownLabel"),
    empty: $("#emptyState"), loadMore: $("#loadMore"), search: $("#searchInput"), year: $("#yearFilter"),
    journal: $("#journalFilter"), medicine: $("#medicineFilter"), purpose: $("#purposeFilter"), sort: $("#sortFilter"),
    active: $("#activeFilters"), reset: $("#resetFilters"), emptyReset: $("#emptyReset"), install: $("#installButton"),
    viewer: $("#viewerDialog"), viewerFrame: $("#viewerFrame"), viewerTitle: $("#viewerTitle"), viewerJournal: $("#viewerJournal"),
    viewerMeta: $("#viewerMeta"), viewerOpen: $("#viewerOpen"), viewerDownload: $("#viewerDownload"), viewerClose: $("#viewerClose"),
    info: $("#infoDialog"), infoOpen: $("#aboutButton"), infoClose: $("#infoClose"), infoDone: $("#infoDone"),
  };

  const PROFESSIONAL_GATE_KEY = "ingal-medical-professional-confirmed";
  const EXIT_URL = "https://ingal-cosmetics.ru/";

  const normalize = (value) => String(value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ru"));
  const driveId = (url) => String(url).match(/\/file\/d\/([^/]+)/)?.[1] || "";
  const previewUrl = (record) => {
    const id = driveId(record.sourceUrl);
    return id ? `https://drive.google.com/file/d/${id}/preview` : record.sourceUrl;
  };
  const downloadUrl = (record) => {
    const id = driveId(record.sourceUrl);
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : record.sourceUrl;
  };

  function initializeProfessionalGate() {
    let confirmed = false;
    try { confirmed = sessionStorage.getItem(PROFESSIONAL_GATE_KEY) === "yes"; } catch (_) {}

    if (confirmed) {
      elements.gate.hidden = true;
      return;
    }

    document.body.classList.add("professional-gate-open");
    const focusable = [elements.gateClose, elements.gateYes, elements.gateNo];

    const leaveMedicalSection = () => window.location.replace(EXIT_URL);
    const confirmProfessionalStatus = () => {
      try { sessionStorage.setItem(PROFESSIONAL_GATE_KEY, "yes"); } catch (_) {}
      elements.gate.hidden = true;
      document.body.classList.remove("professional-gate-open");
    };

    elements.gateYes.addEventListener("click", confirmProfessionalStatus);
    elements.gateNo.addEventListener("click", leaveMedicalSection);
    elements.gateClose.addEventListener("click", leaveMedicalSection);
    elements.gate.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const currentIndex = focusable.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex].focus();
    });

    requestAnimationFrame(() => elements.gate.focus());
  }

  function medicineTokens(value) {
    if (!value || value === "—") return [];
    const known = ["Repart PLA XL", "Repart PLA", "Repart PG", "Repart 5 Active", "Repart 6 Delicate", "Repart G Deep", "Repart G Normal", "Repart G", "Repart Supreme Hard", "Repart Supreme Medium", "Repart Supreme Soft", "Repart Supreme", "Repart Elegance Light", "DSA Black", "DeepSkinArt Black", "DSA", "Cleansing Foam DSA", "Oxygen Gel Mask DSA", "ReDexis", "proLIFE&SKIN"];
    return known.filter((name) => normalize(value).includes(normalize(name))).filter((name, index, list) => !list.some((other, otherIndex) => otherIndex < index && normalize(other).includes(normalize(name))));
  }

  function populateSelect(select, values) {
    const fragment = document.createDocumentFragment();
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      fragment.append(option);
    });
    select.append(fragment);
  }

  function initializeFilters() {
    populateSelect(elements.year, unique(records.map((record) => record.year)).sort((a, b) => b - a));
    populateSelect(elements.journal, unique(records.map((record) => record.journal)));
    populateSelect(elements.medicine, unique(records.flatMap((record) => medicineTokens(record.medicines))));
    populateSelect(elements.purpose, unique(records.map((record) => record.purpose)));
    $("#totalStat").textContent = records.length;
    $("#journalStat").textContent = unique(records.map((record) => record.journal)).length;
  }

  function filteredRecords() {
    const search = normalize(state.search);
    const result = records.filter((record) => {
      if (state.year && String(record.year) !== state.year) return false;
      if (state.journal && record.journal !== state.journal) return false;
      if (state.medicine && !normalize(record.medicines).includes(normalize(state.medicine))) return false;
      if (state.purpose && record.purpose !== state.purpose) return false;
      if (search) {
        const haystack = normalize([record.title, record.summary, record.description, record.author, record.medicines, record.journal, record.issue, record.purpose, record.protocol].join(" "));
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const comparators = {
      newest: (a, b) => b.year - a.year || b.id - a.id,
      oldest: (a, b) => a.year - b.year || a.id - b.id,
      title: (a, b) => a.title.localeCompare(b.title, "ru"),
      journal: (a, b) => a.journal.localeCompare(b.journal, "ru") || b.year - a.year,
    };
    return result.sort(comparators[state.sort]);
  }

  function makeTag(text) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = text;
    return span;
  }

  function cardFor(record) {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".card-year").textContent = record.year;
    node.querySelector(".card-journal").textContent = record.journal;
    node.querySelector(".card-journal").title = record.journal;
    node.querySelector(".card-title").textContent = record.title;
    node.querySelector(".card-summary").textContent = record.summary;
    node.querySelector(".card-author").textContent = record.author || "—";
    node.querySelector(".card-medicines").textContent = record.medicines || "—";
    node.querySelector(".card-issue").textContent = record.issue || "—";
    const tags = node.querySelector(".card-tags");
    tags.append(makeTag(record.purpose));
    if (record.protocol && record.protocol !== "нет") tags.append(makeTag(record.protocol));
    const download = node.querySelector(".icon-download");
    download.href = downloadUrl(record);
    download.download = record.fileName || "reprint.pdf";
    node.querySelector(".card-view").addEventListener("click", () => openViewer(record));
    return node;
  }

  function renderActiveFilters() {
    elements.active.replaceChildren();
    const labels = { search: "Поиск", year: "Год", journal: "Издание", medicine: "Препарат", purpose: "Направление" };
    Object.entries(labels).forEach(([key, label]) => {
      if (!state[key]) return;
      const chip = document.createElement("button");
      chip.className = "filter-chip";
      chip.type = "button";
      chip.textContent = `${label}: ${state[key]} ×`;
      chip.addEventListener("click", () => {
        state[key] = "";
        if (key === "search") elements.search.value = "";
        else elements[key].value = "";
        state.limit = 12;
        render();
      });
      elements.active.append(chip);
    });
  }

  function render() {
    const result = filteredRecords();
    const visible = result.slice(0, state.limit);
    elements.grid.replaceChildren(...visible.map(cardFor));
    elements.count.textContent = `${result.length} ${plural(result.length, "материал", "материала", "материалов")}`;
    elements.shown.textContent = result.length ? `Показано ${visible.length} из ${result.length}` : "Материалы не найдены";
    elements.empty.hidden = result.length !== 0;
    elements.grid.hidden = result.length === 0;
    elements.loadMore.hidden = visible.length >= result.length;
    elements.reset.hidden = !Object.values(state).some((value, index) => index < 5 && value);
    renderActiveFilters();
  }

  function plural(number, one, few, many) {
    const mod10 = number % 10, mod100 = number % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function openViewer(record) {
    elements.viewerTitle.textContent = record.title;
    elements.viewerJournal.textContent = `${record.journal} · ${record.date || record.year}`;
    elements.viewerMeta.textContent = `${record.author || "Автор не указан"} · ${record.pdfFormat}`;
    elements.viewerOpen.href = record.sourceUrl;
    elements.viewerDownload.href = downloadUrl(record);
    elements.viewerDownload.download = record.fileName || "reprint.pdf";
    elements.viewerFrame.src = previewUrl(record);
    elements.viewer.showModal();
  }

  function closeViewer() {
    elements.viewer.close();
    elements.viewerFrame.src = "about:blank";
  }

  function resetFilters() {
    Object.assign(state, { search: "", year: "", journal: "", medicine: "", purpose: "", sort: "newest", limit: 12 });
    elements.search.value = "";
    elements.year.value = "";
    elements.journal.value = "";
    elements.medicine.value = "";
    elements.purpose.value = "";
    elements.sort.value = "newest";
    render();
  }

  function bindEvents() {
    let searchTimer;
    elements.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = elements.search.value; state.limit = 12; render(); }, 120);
    });
    [[elements.year, "year"], [elements.journal, "journal"], [elements.medicine, "medicine"], [elements.purpose, "purpose"], [elements.sort, "sort"]].forEach(([select, key]) => {
      select.addEventListener("change", () => { state[key] = select.value; state.limit = 12; render(); });
    });
    elements.loadMore.addEventListener("click", () => { state.limit += 12; render(); });
    elements.reset.addEventListener("click", resetFilters);
    elements.emptyReset.addEventListener("click", resetFilters);
    elements.viewerClose.addEventListener("click", closeViewer);
    elements.viewer.addEventListener("click", (event) => { if (event.target === elements.viewer) closeViewer(); });
    elements.infoOpen.addEventListener("click", () => elements.info.showModal());
    elements.infoClose.addEventListener("click", () => elements.info.close());
    elements.infoDone.addEventListener("click", () => elements.info.close());
    elements.info.addEventListener("click", (event) => { if (event.target === elements.info) elements.info.close(); });
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); elements.search.focus(); }
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault(); deferredInstallPrompt = event; elements.install.hidden = false;
    });
    elements.install.addEventListener("click", async () => {
      if (!deferredInstallPrompt) { elements.info.showModal(); return; }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      elements.install.hidden = true;
    });
    window.addEventListener("appinstalled", () => { elements.install.hidden = true; });
  }

  async function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      try { await navigator.serviceWorker.register("./sw.js"); } catch (error) { console.warn("PWA registration failed", error); }
    }
  }

  initializeProfessionalGate();
  initializeFilters();
  bindEvents();
  render();
  registerServiceWorker();
})();
