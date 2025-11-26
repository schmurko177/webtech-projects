const { createApp } = Vue;

createApp({
    data() {
        return {
            // UI State
            ui: {
                lang: 'sk',
                theme: 'light',
                zoom: 'day',
                printShowDate: true
            },

            // Settings
            settings: {
                startDate: '2025-01-01',
                endDate: '2025-12-31'
            },

            // Task Form
            taskForm: {
                name: '',
                start: '',
                end: '',
                progress: 0,
                color: '#3b82f6',
                tags: ''
            },
            editingTask: null,

            // Filters
            filters: {
                search: '',
                tag: ''
            },

            // Data
            tasks: [],
            legend: [],

            // Drag & Drop
            dragState: {
                draggedId: null,
                dragOverId: null,
                source: null
            },

            // Localization
            translations: {
                sk: {},
                en: {}
            }
        };
    },

    computed: {
        currentDate() {
            const now = new Date();
            return now.toLocaleDateString(this.ui.lang, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        },

        filteredTasks() {
            let tasks = [...this.tasks];

            // Filter by tag
            if (this.filters.tag) {
                tasks = tasks.filter(task =>
                    task.tags.includes(this.filters.tag)
                );
            }

            // Search
            if (this.filters.search) {
                const query = this.filters.search.toLowerCase();
                tasks = tasks.filter(task =>
                    task.name.toLowerCase().includes(query) ||
                    task.tags.some(tag => tag.toLowerCase().includes(query))
                );
            }

            return tasks;
        },

        allTags() {
            const tags = new Set();
            this.tasks.forEach(task => {
                task.tags.forEach(tag => tags.add(tag));
            });
            return Array.from(tags).sort();
        },

        timelineCells() {
            if (!this.settings.startDate || !this.settings.endDate) return [];

            const start = new Date(this.settings.startDate);
            const end = new Date(this.settings.endDate);
            const cells = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const current = new Date(start);

            while (current <= end) {
                let label, key;
                const cellDate = new Date(current);
                let isToday = false;

                // Check if this cell contains today's date
                switch (this.ui.zoom) {
                    case 'day':
                        isToday = cellDate.getTime() === today.getTime();
                        label = cellDate.getDate();
                        key = cellDate.toISOString().split('T')[0];
                        current.setDate(current.getDate() + 1);
                        break;

                    case 'week':
                        const weekStart = new Date(cellDate);
                        const weekEnd = new Date(cellDate);
                        weekEnd.setDate(weekEnd.getDate() + 6);

                        // Check if today is within this week
                        isToday = today >= weekStart && today <= weekEnd;

                        label = `${weekStart.getDate()}.${weekStart.getMonth()+1}. - ${weekEnd.getDate()}.${weekEnd.getMonth()+1}.`;
                        key = `w-${cellDate.getFullYear()}-${cellDate.getMonth()}-${Math.floor(cellDate.getDate() / 7)}`;
                        current.setDate(current.getDate() + 7);
                        break;

                    case 'month':
                        const monthStart = new Date(cellDate.getFullYear(), cellDate.getMonth(), 1);
                        const monthEnd = new Date(cellDate.getFullYear(), cellDate.getMonth() + 1, 0);

                        // Check if today is within this month
                        isToday = today >= monthStart && today <= monthEnd;

                        const monthNames = this.ui.lang === 'sk'
                            ? ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
                            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        label = monthNames[cellDate.getMonth()];
                        key = `m-${cellDate.getFullYear()}-${cellDate.getMonth()}`;
                        current.setMonth(current.getMonth() + 1);
                        break;

                    case 'quarter':
                        const quarter = Math.floor(cellDate.getMonth() / 3) + 1;
                        const quarterStart = new Date(cellDate.getFullYear(), (quarter - 1) * 3, 1);
                        const quarterEnd = new Date(cellDate.getFullYear(), quarter * 3, 0);

                        // Check if today is within this quarter
                        isToday = today >= quarterStart && today <= quarterEnd;

                        label = `Q${quarter} ${cellDate.getFullYear()}`;
                        key = `q-${cellDate.getFullYear()}-${quarter}`;
                        current.setMonth(current.getMonth() + 3);
                        break;
                }

                cells.push({
                    label,
                    key,
                    isToday,
                    date: new Date(cellDate)
                });
            }

            return cells;
        },

        // ЗМІНА: перейменовано з timelineGridStyle
        timelineGridStyles() {
            const cellWidth = this.getCellWidth();
            const totalWidth = this.timelineCells.length * cellWidth;

            return {
                gridTemplateColumns: `repeat(${this.timelineCells.length}, ${cellWidth}px)`,
                width: totalWidth + 'px'
            };
        },

        todayPosition() {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const start = new Date(this.settings.startDate);
            const end = new Date(this.settings.endDate);

            if (today < start || today > end) return null;

            const total = end - start;
            const passed = today - start;

            return (passed / total) * 100;
        }
    },

    methods: {
        // Localization
        t(key) {
            return this.translations[this.ui.lang]?.[key] || key;
        },

        async loadTranslations() {
            try {
                const [skResp, enResp] = await Promise.all([
                    fetch('data/i18n-sk.json'),
                    fetch('data/i18n-en.json')
                ]);

                this.translations.sk = await skResp.json();
                this.translations.en = await enResp.json();
            } catch (error) {
                console.error('Failed to load translations:', error);
            }
        },

        // Theme
        toggleTheme() {
            this.ui.theme = this.ui.theme === 'light' ? 'dark' : 'light';
            this.applyTheme();
            this.saveUI();
        },

        applyTheme() {
            document.documentElement.setAttribute('data-theme', this.ui.theme);
        },

        onTaskDragStart(taskId) {
            this.dragState.draggedId = taskId;
            this.dragState.source = 'task';
            event.dataTransfer.effectAllowed = 'move';
        },

        onTaskDragOver(taskId) {
            if (this.dragState.draggedId && taskId !== this.dragState.draggedId && this.dragState.source === 'task') {
                event.dataTransfer.dropEffect = 'move';
            }
        },

        onTaskDrop(taskId) {
            if (!this.dragState.draggedId || this.dragState.draggedId === taskId || this.dragState.source !== 'task') return;

            const fromIndex = this.tasks.findIndex(t => t.id === this.dragState.draggedId);
            const toIndex = this.tasks.findIndex(t => t.id === taskId);

            if (fromIndex !== -1 && toIndex !== -1) {
                const [movedTask] = this.tasks.splice(fromIndex, 1);
                this.tasks.splice(toIndex, 0, movedTask);
                this.saveTasks();
            }

            this.dragState.draggedId = null;
            this.dragState.source = null;

            // Видаляємо drag-over класи
            document.querySelectorAll('.task-row.drag-over').forEach(row => {
                row.classList.remove('drag-over');
            });
        },

        onTaskDragEnter(event) {
            if (this.dragState.draggedId && this.dragState.source === 'task') {
                event.currentTarget.classList.add('drag-over');
            }
        },

        onTaskDragLeave(event) {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                event.currentTarget.classList.remove('drag-over');
            }
        },

        onDragStart(taskId) {
            this.dragState.draggedId = taskId;
            this.dragState.source = 'bar';
        },

        onDragOver(taskId) {
            if (taskId !== this.dragState.draggedId && this.dragState.source === 'bar') {
                this.dragState.dragOverId = taskId;
            }
        },

        onDrop(taskId) {
            if (!this.dragState.draggedId || this.dragState.draggedId === taskId || this.dragState.source !== 'bar') return;

            const fromIndex = this.tasks.findIndex(t => t.id === this.dragState.draggedId);
            const toIndex = this.tasks.findIndex(t => t.id === taskId);

            if (fromIndex !== -1 && toIndex !== -1) {
                const [movedTask] = this.tasks.splice(fromIndex, 1);
                this.tasks.splice(toIndex, 0, movedTask);
                this.saveTasks();
            }

            this.dragState.draggedId = null;
            this.dragState.dragOverId = null;
            this.dragState.source = null;
        },

        saveTasksToFile() {
            const data = {
                tasks: this.tasks,
                settings: this.settings,
                legend: this.legend,
                ui: this.ui,
                lastSaved: new Date().toISOString()
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Автоматичне завантаження файлу
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gantt-project-data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        // Task Management
        saveTask() {
            if (!this.taskForm.name || !this.taskForm.start || !this.taskForm.end) {
                alert(this.t('fill_required_fields'));
                return;
            }

            const taskData = {
                name: this.taskForm.name,
                start: this.taskForm.start,
                end: this.taskForm.end,
                progress: Math.max(0, Math.min(100, this.taskForm.progress)),
                color: this.taskForm.color,
                tags: this.taskForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
            };

            if (this.editingTask) {
                Object.assign(this.editingTask, taskData);
                this.editingTask = null;
            } else {
                this.tasks.push({
                    id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    ...taskData
                });
            }

            this.clearForm();
            this.saveTasks(); // Залишаємо і localStorage для швидкості
        },

        deleteTask(taskId) {
            if (confirm(this.t('confirm_delete'))) {
                this.tasks = this.tasks.filter(task => task.id !== taskId);
                this.saveTasks();
            }
        },

        editTask(task) {
            this.editingTask = task;
            this.taskForm = { ...task, tags: task.tags.join(', ') };
        },


        clearForm() {
            this.taskForm = {
                name: '',
                start: '',
                end: '',
                progress: 0,
                color: '#3b82f6',
                tags: ''
            };
            this.editingTask = null;
        },

        cancelEdit() {
            this.clearForm();
        },

        // Inline Editing
        updateTaskProperty(task, property, event, isNumber = false) {
            let value = event.target.innerText.trim();

            // ДОДАВ: перевірка на порожнє значення
            if (!value) {
                event.target.innerText = task[property];
                return;
            }

            if (isNumber) {
                value = parseInt(value) || 0;
                value = Math.max(0, Math.min(100, value));
            }

            if (property === 'start' || property === 'end') {
                // Validate date
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    event.target.innerText = task[property];
                    return;
                }
                value = date.toISOString().split('T')[0];
            }

            task[property] = value;
            this.saveTasks();
        },



        // Gantt Chart
        getCellWidth() {
            switch (this.ui.zoom) {
                case 'day': return 60;
                case 'week': return 100;
                case 'month': return 120;
                case 'quarter': return 150;
                default: return 60;
            }
        },

        // ЗМІНА: оновлений метод для правильного позиціонування при скролі
        getTaskBarStyle(task) {
            const start = new Date(task.start);
            const end = new Date(task.end);
            const rangeStart = new Date(this.settings.startDate);
            const rangeEnd = new Date(this.settings.endDate);

            // Clamp task to visible range
            const visibleStart = start < rangeStart ? rangeStart : start;
            const visibleEnd = end > rangeEnd ? rangeEnd : end;

            if (visibleStart > visibleEnd) {
                return { display: 'none' };
            }

            const totalDuration = rangeEnd - rangeStart;
            const startOffset = visibleStart - rangeStart;
            const taskDuration = visibleEnd - visibleStart;

            const cellWidth = this.getCellWidth();
            const totalWidth = this.timelineCells.length * cellWidth;

            const left = (startOffset / totalDuration) * totalWidth;
            const width = (taskDuration / totalDuration) * totalWidth;

            return {
                left: Math.max(left, 0) + 'px',
                width: Math.max(width, 20) + 'px', // Minimum width for visibility
                backgroundColor: task.color,
                position: 'absolute'
            };
        },

        isTaskHighlighted(task) {
            if (!this.filters.search) return false;
            const query = this.filters.search.toLowerCase();
            return task.name.toLowerCase().includes(query) ||
                task.tags.some(tag => tag.toLowerCase().includes(query));
        },

        updateTaskDate(task, property, event) {
            let value = event.target.innerText.trim();

            // Якщо значення порожнє або не змінилося - відмінити
            if (!value || value === this.formatDate(task[property])) {
                event.target.innerText = this.formatDate(task[property]);
                return;
            }

            // Спроба парсингу дати
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                // Якщо дата невалідна - відновити старе значення
                event.target.innerText = this.formatDate(task[property]);
                return;
            }

            // Оновити значення
            task[property] = date.toISOString().split('T')[0];
            this.saveTasks();
        },

// Відміна редагування по Escape
        cancelDateEdit(event) {
            event.target.blur();
        },

// Покращений метод форматування дати
        formatDate(dateString) {
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return dateString;

                return date.toLocaleDateString(this.ui.lang, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (error) {
                return dateString;
            }
        },

        // Legend
        addLegendItem() {
            this.legend.push({
                id: 'legend-' + Date.now(),
                color: '#6b7280',
                label: ''
            });
            this.saveLegend();
        },

        removeLegendItem(index) {
            this.legend.splice(index, 1);
            this.saveLegend();
        },

        // Import/Export
        exportData() {
            const data = {
                tasks: this.tasks,
                settings: this.settings,
                legend: this.legend,
                ui: this.ui
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gantt-project.json';
            a.click();
            URL.revokeObjectURL(url);
        },

        importData() {
            this.$refs.importFile.click();
        },

        handleImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    if (data.tasks) this.tasks = data.tasks;
                    if (data.settings) this.settings = data.settings;
                    if (data.legend) this.legend = data.legend;
                    if (data.ui) {
                        this.ui = { ...this.ui, ...data.ui };
                        this.applyTheme();
                    }

                    this.saveAll();
                    event.target.value = ''; // Reset file input
                } catch (error) {
                    alert(this.t('import_error'));
                    console.error('Import error:', error);
                }
            };
            reader.readAsText(file);
        },

        // Print
        printChart() {
            window.print();
        },

        // Storage
        saveTasks() {
            localStorage.setItem('gantt-tasks', JSON.stringify(this.tasks));
        },

        saveSettings() {
            localStorage.setItem('gantt-settings', JSON.stringify(this.settings));
        },

        saveLegend() {
            localStorage.setItem('gantt-legend', JSON.stringify(this.legend));
        },

        saveUI() {
            localStorage.setItem('gantt-ui', JSON.stringify(this.ui));
        },

        saveAll() {
            this.saveTasks();
            this.saveSettings();
            this.saveLegend();
            this.saveUI();
        },

        loadAll() {
            const tasks = localStorage.getItem('gantt-tasks');
            const settings = localStorage.getItem('gantt-settings');
            const legend = localStorage.getItem('gantt-legend');
            const ui = localStorage.getItem('gantt-ui');

            if (tasks) this.tasks = JSON.parse(tasks);
            if (settings) this.settings = JSON.parse(settings);
            if (legend) this.legend = JSON.parse(legend);
            if (ui) {
                this.ui = { ...this.ui, ...JSON.parse(ui) };
                this.applyTheme();
            }
        },

        // Scroll functionality
        syncScroll(event) {
            const source = event.target;
            const isHeader = source === this.$refs.timelineHeader;
            const target = isHeader ? this.$refs.ganttBody : this.$refs.timelineHeader;

            if (target && source.scrollLeft !== target.scrollLeft) {
                target.scrollLeft = source.scrollLeft;
            }

            // Додатково синхронізуємо скрол завдань, якщо потрібно
            const tasksList = document.querySelector('.tasks-list');
            if (tasksList && source === this.$refs.ganttBody) {
                tasksList.scrollTop = source.scrollTop;
            }
        },

        scrollToDate(dateString) {
            const date = new Date(dateString);
            const rangeStart = new Date(this.settings.startDate);
            const rangeEnd = new Date(this.settings.endDate);

            if (date < rangeStart || date > rangeEnd) {
                alert(this.t('date_out_of_range'));
                return;
            }

            const totalDuration = rangeEnd - rangeStart;
            const dateOffset = date - rangeStart;

            const scrollPercent = (dateOffset / totalDuration);

            this.$nextTick(() => {
                if (this.$refs.ganttBody) {
                    const maxScroll = this.$refs.ganttBody.scrollWidth - this.$refs.ganttBody.clientWidth;
                    this.$refs.ganttBody.scrollLeft = scrollPercent * maxScroll;
                    if (this.$refs.timelineHeader) {
                        this.$refs.timelineHeader.scrollLeft = scrollPercent * maxScroll;
                    }
                }
            });
        },

        syncRowHeights() {
            this.$nextTick(() => {
                const taskRows = document.querySelectorAll('.task-row');
                const ganttRows = document.querySelectorAll('.gantt-row');

                const maxLength = Math.max(taskRows.length, ganttRows.length);

                for (let i = 0; i < maxLength; i++) {
                    if (taskRows[i] && ganttRows[i]) {
                        const taskHeight = taskRows[i].offsetHeight;
                        const ganttHeight = ganttRows[i].offsetHeight;
                        const maxHeight = Math.max(taskHeight, ganttHeight) + 'px';

                        taskRows[i].style.minHeight = maxHeight;
                        ganttRows[i].style.minHeight = maxHeight;
                    }
                }
            });
        },

        scrollToToday() {
            this.scrollToDate(new Date().toISOString().split('T')[0]);
        },

        initScrollSync() {
            this.$nextTick(() => {
                if (this.$refs.timelineHeader && this.$refs.ganttBody) {
                    // Set initial scroll position
                    this.$refs.timelineHeader.scrollLeft = 0;
                    this.$refs.ganttBody.scrollLeft = 0;
                }
            });
        }
    },

    watch: {
        // Reinitialize scroll when timeline changes
        timelineCells: {
            handler() {
                this.initScrollSync();
            },
            deep: true
        },

        // Update scroll when zoom changes
        'ui.zoom'() {
            this.$nextTick(() => {
                this.initScrollSync();
            });
        },

        filteredTasks: {
            handler() {
                this.$nextTick(() => {
                    this.syncRowHeights();
                });
            },
            deep: true
        }
    },


    async mounted() {
        await this.loadTranslations();
        this.loadAll();
        this.applyTheme();
        this.syncRowHeights();


        // Set default dates if not set
        if (!this.settings.startDate) {
            const today = new Date();
            this.settings.startDate = today.toISOString().split('T')[0];
            this.settings.endDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
                .toISOString().split('T')[0];
        }

        // Initialize scroll after everything is rendered
        this.$nextTick(() => {
            this.initScrollSync();
        });
    }
}).mount('#app');