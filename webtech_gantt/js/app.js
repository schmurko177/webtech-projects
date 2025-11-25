const { createApp } = Vue;

createApp({
    data() {
        return {
            // i18n
            langData: {
                sk: {},
                en: {}
            },
            ui: {
                lang: 'sk',
                theme: 'light',
                zoom: 'day',
                printShowDate: true,
                scrollPos: 0
            },

            settings: {
                startDate: '2025-01-01',
                endDate: '2025-12-31'
            },

            taskForm: {
                editId: null,
                name: '',
                start: '',
                end: '',
                color: '#1976d2',
                progress: 0,
                tags: ''
            },

            filters: {
                search: '',
                tag: ''
            },

            tasks: [],
            legend: [],

            dragIndex: null,
            dragOverIndex: null,

            timelineScrollMax: 0,

            // НОВЕ: вибрана задача
            selectedTaskId: null
        };
    },

    computed: {
        today() {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            return now;
        },

        formattedToday() {
            const d = this.today;
            const options = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' };
            return d.toLocaleDateString(this.ui.lang === 'sk' ? 'sk-SK' : 'en-US', options);
        },

        startDateObj() {
            const base = this.parseDate(this.settings.startDate);
            const taskStarts = this.tasks
                .map(t => this.parseDate(t.start))
                .filter(Boolean);

            if (!taskStarts.length) return base;
            const minTask = new Date(Math.min(...taskStarts));
            if (!base || minTask < base) return minTask;
            return base;
        },

        endDateObj() {
            const base = this.parseDate(this.settings.endDate);
            const taskEnds = this.tasks
                .map(t => this.parseDate(t.end))
                .filter(Boolean);

            if (!taskEnds.length) return base;
            const maxTask = new Date(Math.max(...taskEnds));
            if (!base || maxTask > base) return maxTask;
            return base;
        },

        totalDays() {
            if (!this.startDateObj || !this.endDateObj) return 0;
            const diff = (this.endDateObj - this.startDateObj) / (1000 * 60 * 60 * 24);
            return diff >= 0 ? Math.floor(diff) + 1 : 0;
        },

        visibleTasks() {
            let list = [...this.tasks];

            // filter by tag
            if (this.filters.tag.trim()) {
                const tag = this.filters.tag.toLowerCase();
                list = list.filter(task =>
                    task.tags.some(t => t.toLowerCase().includes(tag))
                );
            }

            // search by text
            if (this.filters.search.trim()) {
                const q = this.filters.search.toLowerCase();
                list = list.filter(task =>
                    task.name.toLowerCase().includes(q) ||
                    task.tags.some(t => t.toLowerCase().includes(q))
                );
            }

            return list;
        },

        // timeline cells depending on zoom level
        timelineCells() {
            const cells = [];
            if (!this.startDateObj || !this.endDateObj) return cells;

            const start = new Date(this.startDateObj);
            const end = new Date(this.endDateObj);

            if (this.ui.zoom === 'day') {
                let cur = new Date(start);
                while (cur <= end) {
                    cells.push({
                        key: cur.toISOString().slice(0, 10),
                        date: new Date(cur),
                        label: cur.getDate()
                    });
                    cur.setDate(cur.getDate() + 1);
                }
            } else if (this.ui.zoom === 'week') {
                let cur = new Date(start);
                let index = 0;
                while (cur <= end) {
                    const label = this.t('week_short') + ' ' + (index + 1);
                    cells.push({
                        key: 'w' + index,
                        date: new Date(cur),
                        label
                    });
                    cur.setDate(cur.getDate() + 7);
                    index++;
                }
            } else if (this.ui.zoom === 'month') {
                let cur = new Date(start.getFullYear(), start.getMonth(), 1);
                while (cur <= end) {
                    const label = (cur.getMonth() + 1) + '/' + cur.getFullYear();
                    cells.push({
                        key: 'm' + cur.getFullYear() + '-' + cur.getMonth(),
                        date: new Date(cur),
                        label
                    });
                    cur.setMonth(cur.getMonth() + 1);
                }
            } else if (this.ui.zoom === 'quarter') {
                let cur = new Date(start.getFullYear(), 0, 1);
                while (cur <= end) {
                    const q = Math.floor(cur.getMonth() / 3) + 1;
                    const label = 'Q' + q + ' ' + cur.getFullYear();
                    cells.push({
                        key: 'q' + cur.getFullYear() + '-' + q,
                        date: new Date(cur),
                        label
                    });
                    cur.setMonth(cur.getMonth() + 3);
                }
            }

            return cells;
        },

        // used for CSS grid template
        timelineGridTemplate() {
            const cols = this.timelineCells.length || 1;
            return `repeat(${cols}, 60px)`;
        },

        todayPosition() {
            if (!this.startDateObj || !this.endDateObj) return null;
            const today = this.today;
            if (today < this.startDateObj || today > this.endDateObj) return null;

            const total = (this.endDateObj - this.startDateObj);
            const offset = (today - this.startDateObj);

            const percent = (offset / total) * 100;
            return percent;
        },

        // чи показувати повзунок
        timelineHasScroll() {
            return this.timelineScrollMax > 0;
        },

        timelineScrollWidth() {
            return this.timelineCells.length * 60;
        }
    },

    methods: {
        /* i18n */
        t(key) {
            const langObj = this.langData[this.ui.lang] || {};
            return langObj[key] || key;
        },

        async loadLangData() {
            const loadLang = async (code) => {
                const resp = await fetch(`data/i18n-${code}.json`);
                this.langData[code] = await resp.json();
            };
            await Promise.all([loadLang('sk'), loadLang('en')]);
        },

        onLangChange() {
            localStorage.setItem('gantt_lang', this.ui.lang);
        },

        toggleTheme() {
            this.ui.theme = this.ui.theme === 'light' ? 'dark' : 'light';
            localStorage.setItem('gantt_theme', this.ui.theme);
        },

        onRangeChange() {
            if (!this.settings.startDate || !this.settings.endDate) return;
            if (this.settings.endDate < this.settings.startDate) {
                // simple fix: swap if user made mistake
                const tmp = this.settings.startDate;
                this.settings.startDate = this.settings.endDate;
                this.settings.endDate = tmp;
            }
            this.saveSettings();
        },

        parseDate(str) {
            if (!str) return null;
            const d = new Date(str);
            if (Number.isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        },

        clampDateToRange(date) {
            if (!this.startDateObj || !this.endDateObj || !date) return date;
            if (date < this.startDateObj) return new Date(this.startDateObj);
            if (date > this.endDateObj) return new Date(this.endDateObj);
            return date;
        },

        submitTask() {
            if (!this.taskForm.name || !this.taskForm.start || !this.taskForm.end) return;

            const tags = this.taskForm.tags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);

            if (this.taskForm.editId) {
                const task = this.tasks.find(t => t.id === this.taskForm.editId);
                if (task) {
                    task.name = this.taskForm.name;
                    task.start = this.taskForm.start;
                    task.end = this.taskForm.end;
                    task.color = this.taskForm.color;
                    task.progress = this.normalizeProgress(this.taskForm.progress);
                    task.tags = tags;
                }
            } else {
                this.tasks.push({
                    id: 't-' + Date.now() + '-' + Math.random().toString(16).slice(2),
                    name: this.taskForm.name,
                    start: this.taskForm.start,
                    end: this.taskForm.end,
                    color: this.taskForm.color,
                    progress: this.normalizeProgress(this.taskForm.progress),
                    tags
                });
            }

            this.saveTasks();
            this.resetTaskForm();
        },

        normalizeProgress(value) {
            let v = Number(value) || 0;
            if (v < 0) v = 0;
            if (v > 100) v = 100;
            return v;
        },

        updateTimelineScroll() {
            const el = this.$refs.timelineScroll;
            if (!el) return;
            const max = el.scrollWidth - el.clientWidth;
            this.timelineScrollMax = max > 0 ? max : 0;

            // якщо після ресайзу полоса стала коротша — підрізаємо scrollPos
            if (this.timelineScrollMax === 0) {
                this.ui.scrollPos = 0;
                if (el.scrollLeft !== 0) el.scrollLeft = 0;
            } else {
                const clamped = Math.min(100, Math.max(0, this.ui.scrollPos));
                this.ui.scrollPos = clamped;
                el.scrollLeft = (clamped / 100) * this.timelineScrollMax;
            }
        },

        onTimelineSlider() {
            const el = this.$refs.timelineScroll;
            if (!el) return;
            el.scrollLeft = (this.ui.scrollPos / 100) * this.timelineScrollMax;
        },

        handleTimelineScroll() {
            const el = this.$refs.timelineScroll;
            if (!el || this.timelineScrollMax <= 0) return;
            this.ui.scrollPos = (el.scrollLeft / this.timelineScrollMax) * 100;
        },

        resetTaskForm() {
            this.taskForm = {
                editId: null,
                name: '',
                start: '',
                end: '',
                color: '#1976d2',
                progress: 0,
                tags: ''
            };
        },

        editTask(task) {
            this.taskForm.editId = task.id;
            this.taskForm.name = task.name;
            this.taskForm.start = task.start;
            this.taskForm.end = task.end;
            this.taskForm.color = task.color;
            this.taskForm.progress = task.progress;
            this.taskForm.tags = task.tags.join(', ');
            this.selectedTaskId = task.id;
        },

        deleteTask(id) {
            this.tasks = this.tasks.filter(t => t.id !== id);
            if (this.selectedTaskId === id) {
                this.selectedTaskId = null;
            }
            this.saveTasks();
        },

        /* inline edit in list */
        onInlineEdit(task, field, event) {
            const text = event.target.innerText.trim();

            if (field === 'name') {
                task.name = text;
            } else if (field === 'start' || field === 'end') {
                task[field] = text;
            } else if (field === 'progress') {
                task.progress = this.normalizeProgress(text);
            } else if (field === 'tags') {
                task.tags = text
                    .split(',')
                    .map(t => t.trim())
                    .filter(Boolean);
            }

            this.saveTasks();
        },

        isTaskHighlighted(task) {
            const s = this.filters.search.trim().toLowerCase();
            if (!s) return false;
            return (
                task.name.toLowerCase().includes(s) ||
                task.tags.some(t => t.toLowerCase().includes(s))
            );
        },

        /* drag & drop ordering */
        onDragStart(index) {
            this.dragIndex = index;
            this.dragOverIndex = null;
        },

        onDrop(index) {
            if (this.dragIndex === null) return;
            const arr = [...this.visibleTasks];
            const moved = arr[this.dragIndex];
            arr.splice(this.dragIndex, 1);
            arr.splice(index, 0, moved);

            // Rebuild tasks in new order according to visible order
            const ids = arr.map(t => t.id);
            this.tasks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

            this.dragIndex = null;
            this.dragOverIndex = null;
            this.saveTasks();
        },

        /* timeline bar style */
        getTaskBarStyle(task) {
            const MS_PER_DAY = 86400000;
            const DAY_WIDTH = 60;

            const start = this.parseDate(task.start);
            const end = this.parseDate(task.end);
            if (!start || !end || !this.startDateObj || !this.endDateObj) {
                return { display: 'none' };
            }

            const clampedStart = this.clampDateToRange(start);
            const clampedEnd = this.clampDateToRange(end);

            const offsetDays = Math.floor((clampedStart - this.startDateObj) / MS_PER_DAY);
            let totalDays = Math.floor((clampedEnd - clampedStart) / MS_PER_DAY) + 1;
            if (totalDays <= 0) totalDays = 1;

            return {
                left: offsetDays * DAY_WIDTH + "px",
                width: totalDays * DAY_WIDTH + "px",
                backgroundColor: task.color,
                position: "absolute",
                height: "22px",
                borderRadius: "6px"
            };
        },

        // вибір задачі (клік по рядку або по бару)
        selectTask(task) {
            this.selectedTaskId = task.id;
        },

        /* import / export JSON */
        exportJson() {
            const data = {
                tasks: this.tasks,
                legend: this.legend,
                settings: this.settings
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gantt-project.json';
            a.click();
            URL.revokeObjectURL(url);
        },

        importJson(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    if (Array.isArray(json.tasks)) this.tasks = json.tasks;
                    if (Array.isArray(json.legend)) this.legend = json.legend;
                    if (json.settings) this.settings = json.settings;
                    this.saveTasks();
                    this.saveLegend();
                    this.saveSettings();
                } catch (err) {
                    console.error('Invalid JSON', err);
                }
            };
            reader.readAsText(file);
        },

        /* legend */
        addLegendItem() {
            this.legend.push({
                id: 'l-' + Date.now() + '-' + Math.random().toString(16).slice(2),
                color: '#1976d2',
                label: ''
            });
            this.saveLegend();
        },

        removeLegendItem(index) {
            this.legend.splice(index, 1);
            this.saveLegend();
        },

        saveLegend() {
            localStorage.setItem('gantt_legend', JSON.stringify(this.legend));
        },

        /* localStorage */
        saveTasks() {
            localStorage.setItem('gantt_tasks', JSON.stringify(this.tasks));
            this.$nextTick(() => this.updateTimelineScroll());
        },

        saveSettings() {
            localStorage.setItem('gantt_settings', JSON.stringify(this.settings));
        },

        restoreFromStorage() {
            const tasks = localStorage.getItem('gantt_tasks');
            if (tasks) {
                try {
                    this.tasks = JSON.parse(tasks);
                } catch (e) {
                    this.tasks = [];
                }
            }

            const legend = localStorage.getItem('gantt_legend');
            if (legend) {
                try {
                    this.legend = JSON.parse(legend);
                } catch (e) {
                    this.legend = [];
                }
            }

            const settings = localStorage.getItem('gantt_settings');
            if (settings) {
                try {
                    this.settings = JSON.parse(settings);
                } catch (e) {
                    /* ignore */
                }
            }

            const lang = localStorage.getItem('gantt_lang');
            if (lang) this.ui.lang = lang;

            const theme = localStorage.getItem('gantt_theme');
            if (theme) this.ui.theme = theme;

            const printShowDate = localStorage.getItem('gantt_print_date');
            if (printShowDate !== null) {
                this.ui.printShowDate = printShowDate === 'true';
            }
        },

        printDiagram() {
            localStorage.setItem('gantt_print_date', this.ui.printShowDate ? 'true' : 'false');
            if (!this.ui.printShowDate) {
                document.body.classList.add('gantt-app--no-print-date');
            } else {
                document.body.classList.remove('gantt-app--no-print-date');
            }
            window.print();
        },

        syncScrollbars() {
            const top = this.$refs.scrollTopSync;
            const main = this.$refs.timelineScroll;
            if (!top || !main) return;

            top.scrollLeft = main.scrollLeft;

            top.onscroll = () => {
                main.scrollLeft = top.scrollLeft;
            };
            main.onscroll = () => {
                top.scrollLeft = main.scrollLeft;
            };
        },
    },



    async mounted() {
        await this.loadLangData();
        this.restoreFromStorage();

        this.$nextTick(() => {
            this.syncScrollbars();

            const el = this.$refs.timelineScroll;
            if (el) {
                el.addEventListener('scroll', this.handleTimelineScroll);
            }

            this.updateTimelineScroll();
        });

        window.addEventListener('resize', this.updateTimelineScroll);
    },

    beforeUnmount() {
        const el = this.$refs.timelineScroll;
        if (el) {
            el.removeEventListener('scroll', this.handleTimelineScroll);
        }
        window.removeEventListener('resize', this.updateTimelineScroll);
    },





}).mount('#app');
