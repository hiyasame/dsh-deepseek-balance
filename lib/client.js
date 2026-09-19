window.__ModuleLoader__.load({
	id: "dsh-deepseek-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region \0dsh-css:dsh-deepseek-balance/BalancePill.module.css
		const cssText = ".dsb_anchor{min-width:0;max-width:100%;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex;position:relative}.dsb_pill{box-sizing:border-box;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:24px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.dsb_pill svg{flex:none;width:14px;height:14px}.dsb_pill:hover,.dsb_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dsb_warn{color:var(--dsw-alias-state-warn-label)}.dsb_warn:hover,.dsb_warn[aria-expanded=true]{color:var(--dsw-alias-state-warn-primary)}.dsb_error{color:var(--dsw-alias-state-error-primary)}.dsb_label{text-overflow:ellipsis;min-width:0;overflow:hidden}.dsb_panel{box-sizing:border-box;width:max-content;min-width:236px;max-width:min(360px,80vw);color:var(--dsw-alias-label-primary);white-space:normal;text-align:left;cursor:default;z-index:30;background:var(--dsw-specific-tip,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:10px 12px;font-size:13px;line-height:20px;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);box-shadow:var(--dsw-elevation-soft,0 6px 24px #00000029)}.dsb_panelTitle{align-items:center;gap:8px;font-weight:500;display:flex}.dsb_panelTitle svg{flex:none;width:14px;height:14px;color:var(--dsw-alias-label-tertiary)}.dsb_panelValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;margin-left:auto}.dsb_rule{background:var(--dsw-alias-border-l1);height:.5px;margin:8px 0}.dsb_section+.dsb_section{margin-top:8px}.dsb_sectionName{color:var(--dsw-alias-label-tertiary);margin-bottom:2px;font-size:12px}.dsb_details{margin:0;gap:4px 12px;display:grid;grid-template-columns:auto 1fr}.dsb_details dt{color:var(--dsw-alias-label-tertiary);font-weight:400}.dsb_details dd{margin:0;text-align:right;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}.dsb_foot{align-items:center;gap:8px;margin-top:10px;display:flex}.dsb_meta{color:var(--dsw-alias-label-caption);min-width:0;flex:1;font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dsb_refresh{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);cursor:pointer;border:none;border-radius:999px;flex:none;padding:2px 10px;font:inherit;font-size:12px}.dsb_refresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}.dsb_refresh:disabled{opacity:.6;cursor:default}.dsb_reason{color:var(--dsw-alias-state-error-primary);word-break:break-word}";
		const tagId = "dsh-deepseek-balance/BalancePill.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-deepseek-balance";
			tag.dataset.pluginCss = tagId;
			tag.textContent = cssText;
			document.head.appendChild(tag);
		}
		/**
		* Scoped class names for this module's stylesheet. Read the map, never the
		* CSS text: `cssText.pill` would resolve to `String.prototype.anchor` and
		* friends, silently rendering unstyled markup.
		*/
		const css = {
			anchor: "dsb_anchor",
			pill: "dsb_pill",
			warn: "dsb_warn",
			error: "dsb_error",
			label: "dsb_label",
			panel: "dsb_panel",
			panelTitle: "dsb_panelTitle",
			panelValue: "dsb_panelValue",
			rule: "dsb_rule",
			section: "dsb_section",
			sectionName: "dsb_sectionName",
			details: "dsb_details",
			foot: "dsb_foot",
			meta: "dsb_meta",
			refresh: "dsb_refresh",
			reason: "dsb_reason"
		};
		//#endregion
		//#region lib/client/format.js
		/** Host route serving the balance payload. */
		const ENDPOINT = "/api/deepseek-balance";
		/** Refresh interval used until the host reports its configured one. */
		const DEFAULT_POLL_MS = 1e4;
		/** Bounds accepting a host-provided interval; anything else re-paces to the default. */
		const MIN_POLL_MS = 1e3;
		const MAX_POLL_MS = 36e5;
		/** Total balance below which the pill switches to the warning tone. */
		const LOW_BALANCE = 10;
		/** Currency symbols for the currencies the provider reports. */
		const CURRENCY_SYMBOLS = {
			CNY: "\xA5",
			USD: "$",
			EUR: "\u20AC",
			GBP: "\xA3",
			JPY: "\xA5"
		};
		/**
		* Parse one provider decimal string.
		* @param value - decimal string.
		* @returns the number, or null when unparseable.
		*/
		function numeric(value) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		/**
		* Format one balance for display, with its currency symbol when known.
		* @param currency - ISO currency code.
		* @param value - decimal string.
		* @returns display-ready amount.
		*/
		function formatAmount(currency, value) {
			const parsed = numeric(value);
			const symbol = CURRENCY_SYMBOLS[currency] ?? "";
			if (parsed === null) return symbol === "" ? `${value} ${currency}`.trim() : `${symbol}${value}`;
			const text = parsed.toLocaleString(void 0, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});
			if (symbol !== "") return `${symbol}${text}`;
			return currency === "" ? text : `${text} ${currency}`;
		}
		/**
		* Format the provider timestamp for the dialog footer.
		* @param iso - ISO instant.
		* @returns local time, or an empty string.
		*/
		function formatTime(iso) {
			if (typeof iso !== "string") return "";
			const at = new Date(iso);
			return Number.isNaN(at.getTime()) ? "" : at.toLocaleTimeString();
		}
		/**
		* Strip the scheme from an endpoint so the footer stays compact.
		* @param baseURL - provider origin.
		* @returns host plus path.
		*/
		function shortEndpoint(baseURL) {
			return typeof baseURL === "string" ? baseURL.replace(/^https?:\/\//, "") : "";
		}
		/**
		* Accept a host-provided refresh interval inside sane bounds.
		* @param value - interval reported by the host, if any.
		* @returns the interval to schedule next.
		*/
		function clampPoll(value) {
			return Number.isFinite(value) && value >= MIN_POLL_MS && value <= MAX_POLL_MS ? value : DEFAULT_POLL_MS;
		}
		//#endregion
		//#region lib/client/locales.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "deepseekBalance";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"pill.balance": "余额 {amount}",
			"pill.loading": "余额 \u2026",
			"pill.error": "余额 \u2014",
			"pill.unavailable": "余额不可用",
			"status.loading": "正在读取 DeepSeek 余额",
			"dialog.title": "DeepSeek \u4F59\u989D",
			"dialog.total": "\u603B\u4F59\u989D",
			"dialog.granted": "\u8D60\u9001\u4F59\u989D",
			"dialog.toppedUp": "\u5145\u503C\u4F59\u989D",
			"dialog.available": "\u8D26\u6237\u53EF\u7528",
			"dialog.availableYes": "\u53EF\u7528",
			"dialog.availableNo": "\u4E0D\u53EF\u7528",
			"dialog.credential": "\u51ED\u8BC1\u6765\u6E90",
			"dialog.endpoint": "\u63A5\u53E3\u5730\u5740",
			"dialog.updated": "\u66F4\u65B0\u4E8E",
			"dialog.refresh": "\u5237\u65B0",
			"dialog.refreshing": "\u5237\u65B0\u4E2D\u2026",
			"dialog.empty": "\u63A5\u53E3\u672A\u8FD4\u56DE\u4F59\u989D\u4FE1\u606F",
			"dialog.close": "\u5173\u95ED"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"pill.balance": "Balance {amount}",
			"pill.loading": "Balance \u2026",
			"pill.error": "Balance \u2014",
			"pill.unavailable": "Balance unavailable",
			"status.loading": "Reading the DeepSeek balance",
			"dialog.title": "DeepSeek balance",
			"dialog.total": "Total",
			"dialog.granted": "Granted",
			"dialog.toppedUp": "Topped up",
			"dialog.available": "Account usable",
			"dialog.availableYes": "yes",
			"dialog.availableNo": "no",
			"dialog.credential": "Credential source",
			"dialog.endpoint": "Endpoint",
			"dialog.updated": "Updated",
			"dialog.refresh": "Refresh",
			"dialog.refreshing": "Refreshing\u2026",
			"dialog.empty": "The provider returned no balance information",
			"dialog.close": "Close"
		};
		//#endregion
		//#region lib/client/BalancePill.js
		/** Wallet mark shared by the pill and the dialog title. */
		function WalletIcon() {
			return react.createElement("svg", {
				viewBox: "0 0 16 16",
				"aria-hidden": true,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.2,
				strokeLinecap: "round"
			}, react.createElement("rect", {
				x: 1.5,
				y: 3.5,
				width: 13,
				height: 9,
				rx: 2
			}), react.createElement("circle", {
				cx: 8,
				cy: 8,
				r: 2.1
			}), react.createElement("path", {
				d: "M4.1 8h.8M11.1 8h.8"
			}));
		}
		/**
		* One detail row pair.
		* @param props - label and value.
		* @returns a dt/dd fragment.
		*/
		function Row({ label, value }) {
			return react.createElement(react.Fragment, null, react.createElement("dt", null, label), react.createElement("dd", null, value));
		}
		/**
		* DeepSeek remaining-balance pill for the composer statistics strip.
		*
		* The host owns credential resolution and caching; this component only
		* renders the payload and asks for a forced refresh when the user does.
		* A 404 means the host half is not mounted, so the strip renders nothing
		* rather than an error the user cannot act on.
		*
		* The pill is a direct flex item of the composer dock, exactly like the
		* statistic pills `dsh-client-ui-chat` contributes to the same slot: the
		* slot renders every entry in registration order as a bare child, so this
		* component must size to its own content and never claim the row width —
		* a full-width wrapper turns the dock's shared line into a squeeze that
		* ellipsizes the host's own figures.
		* @param props - slot props (the `t` translator).
		* @returns the pill, or null before the first host contact.
		*/
		function BalancePill({ t }) {
			const [state, setState] = react.useState({ status: "loading" });
			const [open, setOpen] = react.useState(false);
			const [refreshing, setRefreshing] = react.useState(false);
			const anchorRef = react.useRef(null);
			const aliveRef = react.useRef(true);
			/** When the payload on screen was actually read, and its interval. */
			const freshnessRef = react.useRef({ at: Date.now(), pollMs: DEFAULT_POLL_MS });
			/**
			* Read the host route once.
			* @param force - ask the host to bypass its response cache.
			* @returns the host's refresh interval and payload instant, when it answered.
			*/
			const load = react.useCallback(async (force) => {
				try {
					const response = await fetch(force ? `${ENDPOINT}?refresh=1` : ENDPOINT, { headers: { accept: "application/json" } });
					if (!aliveRef.current) return void 0;
					if (response.status === 404) {
						setState({ status: "absent" });
						return void 0;
					}
					let body;
					try {
						body = await response.json();
					} catch {
						body = void 0;
					}
					if (!aliveRef.current) return void 0;
					if (body === void 0 || body.ok !== true) {
						setState({
							status: "error",
							code: body?.error ?? `HTTP_${response.status}`,
							message: body?.message ?? `HTTP ${response.status}`,
							payload: body
						});
						return { pollMs: body?.pollMs, fetchedAt: body?.fetchedAt };
					}
					setState({ status: "ready", payload: body });
					return { pollMs: body.pollMs, fetchedAt: body.fetchedAt };
				} catch (error) {
					if (!aliveRef.current) return void 0;
					setState({
						status: "error",
						code: "NETWORK",
						message: String(error?.message ?? error)
					});
					return void 0;
				}
			}, []);
			react.useEffect(() => {
				aliveRef.current = true;
				let timer = null;
				/**
				* Read once, then schedule the next read from the host's interval.
				*
				* The interval is a freshness guarantee, not just a polling hint: once
				* the payload on screen is older than it, the next read asks the host
				* to bypass its own cache. That keeps the cadence correct even when a
				* larger host cache TTL is in force.
				*/
				const tick = async () => {
					const interval = clampPoll(freshnessRef.current.pollMs);
					const stale = Date.now() - freshnessRef.current.at >= interval * 0.9;
					const outcome = (await load(stale)) ?? {};
					if (!aliveRef.current) return;
					const fetched = Date.parse(outcome.fetchedAt);
					freshnessRef.current = {
						at: Number.isFinite(fetched) ? fetched : Date.now(),
						pollMs: clampPoll(outcome.pollMs)
					};
					timer = setTimeout(tick, freshnessRef.current.pollMs);
				};
				tick();
				return () => {
					aliveRef.current = false;
					if (timer !== null) clearTimeout(timer);
				};
			}, [load]);
			react.useEffect(() => {
				if (!open) return void 0;
				const onPointerDown = (event) => {
					if (anchorRef.current !== null && !anchorRef.current.contains(event.target)) setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("mousedown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("mousedown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			const refresh = react.useCallback(async () => {
				setRefreshing(true);
				await load(true);
				if (aliveRef.current) setRefreshing(false);
			}, [load]);
			if (state.status === "absent") return null;
			const ready = state.status === "ready";
			const payload = state.payload;
			const balances = ready ? payload.balances ?? [] : [];
			const primary = balances.length > 0 ? balances[0] : void 0;
			const total = primary !== void 0 ? numeric(primary.total) : null;
			let tone = "";
			let label;
			if (state.status === "loading") label = t("pill.loading");
			else if (state.status === "error") {
				label = t("pill.error");
				tone = "error";
			} else if (primary === void 0) {
				label = t("pill.unavailable");
				tone = "error";
			} else if (payload.isAvailable === false) {
				label = t("pill.unavailable");
				tone = "error";
			} else {
				label = t("pill.balance", { amount: formatAmount(primary.currency, primary.total) });
				if (total !== null && total < LOW_BALANCE) tone = "warn";
			}
			const title = state.status === "error" ? state.message : primary !== void 0 ? `${t("dialog.total")}: ${formatAmount(primary.currency, primary.total)}\n${t("dialog.granted")}: ${formatAmount(primary.currency, primary.granted)}` : label;
			const panel = open ? react.createElement("div", {
				className: css.panel,
				role: "dialog",
				"aria-label": t("dialog.title")
			}, react.createElement("div", { className: css.panelTitle }, react.createElement(WalletIcon, null), react.createElement("span", null, t("dialog.title")), primary !== void 0 ? react.createElement("span", { className: css.panelValue }, formatAmount(primary.currency, primary.total)) : null), react.createElement("div", { className: css.rule, "aria-hidden": true }), state.status === "error" ? react.createElement("div", { className: css.reason }, state.message) : ready && balances.length > 0 ? balances.map((entry) => react.createElement("div", {
				className: css.section,
				key: entry.currency
			}, balances.length > 1 ? react.createElement("div", { className: css.sectionName }, entry.currency) : null, react.createElement("dl", { className: css.details }, react.createElement(Row, {
				label: t("dialog.total"),
				value: formatAmount(entry.currency, entry.total)
			}), react.createElement(Row, {
				label: t("dialog.granted"),
				value: formatAmount(entry.currency, entry.granted)
			}), react.createElement(Row, {
				label: t("dialog.toppedUp"),
				value: formatAmount(entry.currency, entry.toppedUp)
			})))) : react.createElement("div", { className: css.reason }, t("dialog.empty")), ready ? react.createElement("div", { className: css.section }, react.createElement("dl", { className: css.details }, react.createElement(Row, {
				label: t("dialog.available"),
				value: payload.isAvailable === true ? t("dialog.availableYes") : t("dialog.availableNo")
			}), payload.credentialSource !== void 0 ? react.createElement(Row, {
				label: t("dialog.credential"),
				value: String(payload.credentialSource)
			}) : null)) : null, react.createElement("div", { className: css.foot }, react.createElement("span", {
				className: css.meta,
				title: payload?.baseURL
			}, [shortEndpoint(payload?.baseURL), formatTime(payload?.fetchedAt) === "" ? "" : `${t("dialog.updated")} ${formatTime(payload.fetchedAt)}`].filter((part) => part !== "").join(" \xB7 ")), react.createElement("button", {
				type: "button",
				className: css.refresh,
				disabled: refreshing,
				onClick: refresh
			}, refreshing ? t("dialog.refreshing") : t("dialog.refresh")))) : null;
			return react.createElement("span", {
				ref: anchorRef,
				className: css.anchor,
				"data-composer-balance": true
			}, react.createElement("button", {
				type: "button",
				className: tone === "" ? css.pill : `${css.pill} ${css[tone]}`,
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-label": label,
				title,
				onClick: () => setOpen(!open)
			}, react.createElement(WalletIcon, null), react.createElement("span", { className: css.label }, label)), panel);
		}
		//#endregion
		//#region lib/client/index.js
		/** Required services: the slot registry and the locale registry. */
		const inject = ["slots", "locale"];
		/**
		* Client plugin body: register the dictionaries and the balance pill.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "deepseek-balance: dictionaries");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "deepseek-balance",
				order: 10,
				locale: NS
			}, BalancePill));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
