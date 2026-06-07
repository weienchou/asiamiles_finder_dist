// ==UserScript==
// @name         Cathay Award Search
// @name:zh-TW   國泰里程票搜尋工具
// @namespace    https://wayne.tw
// @version      1.0.7
// @author       Wayne
// @description  國泰里程獎勵機票批次查詢：餘位矩陣 heatmap、展開航班明細、排序/篩選、收藏、結果快取。
// @license      GPL
// @include      http://localhost:*/*
// @include      https://localhost:*/*
// @include      http://127.0.0.1:*/*
// @match        https://*.cathaypacific.com/cx/*/book-a-trip/redeem-flights/redeem-flight-awards.html*
// @match        https://*.cathaypacific.com/cx/*/book-a-trip/redeem-flights/facade.html*
// @match        https://api.cathaypacific.com/redibe/IBEFacade*
// @match        https://book.cathaypacific.com/*
// @match        https://asiamiles-finder.pages.dev/*
// @match        https://asiamiles-finder.wuts.cc/*
// @match        http://localhost:*/*
// @connect      cathaypacific.com
// @grant        GM_getValue
// @grant        GM_log
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
	"use strict";
	var protoOf = Object.getPrototypeOf;
	var changedStates, derivedStates, curDeps, curNewDerives, alwaysConnectedDom = { isConnected: 1 };
	var gcCycleInMs = 1e3, statesToGc, propSetterCache = {};
	var objProto = protoOf(alwaysConnectedDom), funcProto = protoOf(protoOf), _undefined;
	var addAndScheduleOnFirst = (set, s, f, waitMs) => (set ?? (waitMs ? setTimeout(f, waitMs) : queueMicrotask(f), new Set())).add(s);
	var runAndCaptureDeps = (f, deps, arg) => {
		let prevDeps = curDeps;
		curDeps = deps;
		try {
			return f(arg);
		} catch (e) {
			console.error(e);
			return arg;
		} finally {
			curDeps = prevDeps;
		}
	};
	var keepConnected = (l) => l.filter((b) => b._dom?.isConnected);
	var addStatesToGc = (d) => statesToGc = addAndScheduleOnFirst(statesToGc, d, () => {
		for (let s of statesToGc) s._bindings = keepConnected(s._bindings), s._listeners = keepConnected(s._listeners);
		statesToGc = _undefined;
	}, gcCycleInMs);
	var stateProto = {
		get val() {
			curDeps?._getters?.add(this);
			return this.rawVal;
		},
		get oldVal() {
			curDeps?._getters?.add(this);
			return this._oldVal;
		},
		set val(v) {
			curDeps?._setters?.add(this);
			if (v !== this.rawVal) {
				this.rawVal = v;
				this._bindings.length + this._listeners.length ? (derivedStates?.add(this), changedStates = addAndScheduleOnFirst(changedStates, this, updateDoms)) : this._oldVal = v;
			}
		}
	};
	var state = (initVal) => ({
		__proto__: stateProto,
		rawVal: initVal,
		_oldVal: initVal,
		_bindings: [],
		_listeners: []
	});
	var bind = (f, dom) => {
		let deps = {
			_getters: new Set(),
			_setters: new Set()
		}, binding = { f }, prevNewDerives = curNewDerives;
		curNewDerives = [];
		let newDom = runAndCaptureDeps(f, deps, dom);
		newDom = (newDom ?? document).nodeType ? newDom : new Text(newDom);
		for (let d of deps._getters) deps._setters.has(d) || (addStatesToGc(d), d._bindings.push(binding));
		for (let l of curNewDerives) l._dom = newDom;
		curNewDerives = prevNewDerives;
		return binding._dom = newDom;
	};
	var derive = (f, s = state(), dom) => {
		let deps = {
			_getters: new Set(),
			_setters: new Set()
		}, listener = {
			f,
			s
		};
		listener._dom = dom ?? curNewDerives?.push(listener) ?? alwaysConnectedDom;
		s.val = runAndCaptureDeps(f, deps, s.rawVal);
		for (let d of deps._getters) deps._setters.has(d) || (addStatesToGc(d), d._listeners.push(listener));
		return s;
	};
	var add = (dom, ...children) => {
		for (let c of children.flat(Infinity)) {
			let protoOfC = protoOf(c ?? 0);
			let child = protoOfC === stateProto ? bind(() => c.val) : protoOfC === funcProto ? bind(c) : c;
			child != _undefined && dom.append(child);
		}
		return dom;
	};
	var tag = (ns, name, ...args) => {
		let [{ is, ...props }, ...children] = protoOf(args[0] ?? 0) === objProto ? args : [{}, ...args];
		let dom = ns ? document.createElementNS(ns, name, { is }) : document.createElement(name, { is });
		for (let [k, v] of Object.entries(props)) {
			let getPropDescriptor = (proto) => proto ? Object.getOwnPropertyDescriptor(proto, k) ?? getPropDescriptor(protoOf(proto)) : _undefined;
			let cacheKey = name + "," + k;
			let propSetter = propSetterCache[cacheKey] ??= getPropDescriptor(protoOf(dom))?.set ?? 0;
			let setter = k.startsWith("on") ? (v, oldV) => {
				let event = k.slice(2);
				dom.removeEventListener(event, oldV);
				dom.addEventListener(event, v);
			} : propSetter ? propSetter.bind(dom) : dom.setAttribute.bind(dom, k);
			let protoOfV = protoOf(v ?? 0);
			k.startsWith("on") || protoOfV === funcProto && (v = derive(v), protoOfV = stateProto);
			protoOfV === stateProto ? bind(() => (setter(v.val, v._oldVal), dom)) : setter(v);
		}
		return add(dom, children);
	};
	var handler = (ns) => ({ get: (_, name) => tag.bind(_undefined, ns, name) });
	var update = (dom, newDom) => newDom ? newDom !== dom && dom.replaceWith(newDom) : dom.remove();
	var updateDoms = () => {
		let iter = 0, derivedStatesArray = [...changedStates].filter((s) => s.rawVal !== s._oldVal);
		do {
			derivedStates = new Set();
			for (let l of new Set(derivedStatesArray.flatMap((s) => s._listeners = keepConnected(s._listeners)))) derive(l.f, l.s, l._dom), l._dom = _undefined;
		} while (++iter < 100 && (derivedStatesArray = [...derivedStates]).length);
		let changedStatesArray = [...changedStates].filter((s) => s.rawVal !== s._oldVal);
		changedStates = _undefined;
		for (let b of new Set(changedStatesArray.flatMap((s) => s._bindings = keepConnected(s._bindings)))) update(b._dom, bind(b.f, b._dom)), b._dom = _undefined;
		for (let s of changedStatesArray) s._oldVal = s.rawVal;
	};
	var van_default = {
		tags: new Proxy((ns) => new Proxy(tag, handler(ns)), handler()),
		hydrate: (dom, f) => update(dom, bind(f, dom)),
		add,
		state,
		derive
	};
	function buildLang(browser_lang) {
		return browser_lang != "zh" ? {
			"ec": "HK",
			"el": "en",
			"search": "Search",
			"searching": "<span class='spin'></span> Searching...",
			"searching_w_cancel": "<span class='spin'></span> Searching... (Click to Stop)",
			"next_batch": "Load More...",
			"search_20": "Batch Availability for 20 Days",
			"flights": "Available Flights",
			"nonstop": "Non-Stop",
			"first": "First",
			"business": "Bus",
			"premium": "Prem",
			"economy": "Econ",
			"first_full": "First Class",
			"business_full": "Business Class",
			"premium_full": "Premium Economy",
			"economy_full": "Economy Class",
			"date": "Date",
			"no_flights": "No Redemption Availability",
			"error": "Unknown Error... Try Again",
			"bulk_batch": "Batch Search",
			"bulk_flights": "Flights",
			"login": "Reminder: Login before searching.",
			"tab_retrieve_fail": "Failed to retrieve key. Try logging out and in again.",
			"key_exhausted": "Key request quota exhausted, attempting to get new key...",
			"getting_key": "Attempting to retrieve API key...",
			"invalid_code": "Invalid Destination Code",
			"invalid_date": "Invalid Date",
			"multi_book": "Book Multi-City Award",
			"query": "Search",
			"delete": "Remove",
			"search_selected": "Search All Saved",
			"book_multi": "Book Multicity Award",
			"nosaves": "You do not have any saved queries. Click on ♥ in batch results to save.",
			"loading": "Searching...",
			"mixed": "Mixed Class Available via"
		} : {
			"ec": "TW",
			"el": "zh",
			"search": "搜尋",
			"searching": "<span class='spin'></span> 請稍候...",
			"searching_w_cancel": "<span class='spin'></span> 搜尋中...（點我暫停）",
			"next_batch": "載入更多...",
			"search_20": "批次搜尋 20 天可兌換航班",
			"flights": "可兌換航班",
			"nonstop": "直飛",
			"first": "頭等",
			"business": "商務",
			"premium": "豪經",
			"economy": "經濟",
			"first_full": "頭等艙",
			"business_full": "商務艙",
			"premium_full": "特選經濟艙",
			"economy_full": "經濟艙",
			"date": "日期",
			"no_flights": "查無獎勵機位",
			"error": "不明錯誤... 再試一次",
			"bulk_batch": "批次查詢",
			"bulk_flights": "航班",
			"login": "提醒：請先登入後再搜尋。",
			"tab_retrieve_fail": "無法取得金鑰，請試著登出再重新登入。",
			"key_exhausted": "金鑰查詢額度用盡，正嘗試取得新金鑰...",
			"getting_key": "正在嘗試取得 API 金鑰...",
			"invalid_code": "目的地代碼錯誤",
			"invalid_date": "日期錯誤",
			"multi_book": "兌換多城市行程",
			"query": "查詢",
			"delete": "刪除",
			"search_selected": "批次查詢收藏行程",
			"book_multi": "多目的地行程預定",
			"nosaves": "您沒有收藏任何行程。可在批次結果頁點擊愛心 ♥ 收藏。",
			"loading": "查詢中...",
			"mixed": "潛在混艙航班經由"
		};
	}
	function buildStyleCss(C, lang) {
		return `
        .cx_form *, .bulk_box *, .multi_box * { box-sizing:border-box; -webkit-text-size-adjust:none; }
        .cx_container { font-family:"GT Walsheim","Cathay Sans EN",CathaySans_Rg,-apple-system,"PingFang TC","Noto Sans TC",sans-serif; color:${C.ink}; }
        .cx_form a, .bulk_box a { color:${C.jade}; }
        .cx_form input:focus, .multi_box input:focus { outline:none; border-color:${C.jade}; }
        .results_container { max-width:920px; margin:0 auto; padding:24px 20px; }
        .cont_query .modal { display:none !important; }

        .spin { display:inline-block; width:14px; height:14px; vertical-align:-2px; margin-right:6px; border:2px solid rgba(255,255,255,.45); border-top-color:#fff; border-radius:50%; animation:cxspin .7s linear infinite; }
        @keyframes cxspin { to { transform:rotate(360deg); } }

        /* ── form panel ── */
        .cx_form { position:relative; z-index:11; color-scheme:dark; background:${C.panel}; border:1px solid ${C.border}; border-bottom:none; border-radius:14px 14px 0 0; box-shadow:0 10px 30px rgba(0,0,0,.35); margin:10px 0 0; padding:14px; }
        .cx_titlebar { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .cx_title { font-size:16px; font-weight:600; letter-spacing:.2px; }
        .cx_title a { text-decoration:none; color:${C.ink}; }
        .cx_ver { display:inline-block; margin-left:8px; font-size:11px; font-weight:600; color:${C.ink2}; background:${C.subtle}; border:1px solid ${C.border}; border-radius:20px; padding:2px 8px; vertical-align:1px; }

        .cx_saved a { display:inline-flex; align-items:center; gap:6px; text-decoration:none; background:${C.subtle}; color:${C.ink2}; border:1px solid ${C.border}; border-radius:8px; padding:5px 11px; font-size:13px; font-weight:500; transition:background .15s, border-color .15s; }
        .cx_saved a:hover { background:${C.borderStrong}; border-color:${C.borderStrong}; }
        .cx_saved svg.heart_save { width:14px; height:14px; }
        .cx_saved svg.heart_save path { fill:${C.ink2}; }

        /* ── route-hero form（出發 ⇄ 目的 主視覺卡）── */
        .labels { display:flex; flex-direction:column; gap:10px; position:relative; }
        .labels label.rh_field { position:relative; margin:0; min-width:0; background:${C.subtle}; border:1px solid ${C.border}; border-radius:10px; transition:border-color .15s, box-shadow .15s, background .15s; }
        .labels label.rh_field:focus-within { border-color:${C.jade}; background:${C.surface}; box-shadow:0 0 0 3px rgba(47,75,255,.25); }
        .labels label.rh_field > span { position:absolute; top:9px; left:14px; color:${C.ink2}; font-size:11px; font-weight:600; letter-spacing:.4px; text-transform:uppercase; pointer-events:none; }
        .labels input { width:100%; border:none; background:transparent; color:${C.ink}; outline:none; }
        .labels i.clear_from, .labels i.clear_to { position:absolute; right:12px; top:50%; transform:translateY(-50%); color:${C.ink3}; cursor:pointer; opacity:.5; transition:opacity .15s; }
        .labels i.clear_from:hover, .labels i.clear_to:hover { opacity:1; }
        .labels i.clear_from svg, .labels i.clear_to svg { width:16px; height:16px; display:block; }

        /* 航線列：出發 ⇄ 目的（仿 App 卡片：灰卡包住、透明大字、中央交換）*/
        .route_row { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:2px; background:${C.subtle}; border:1px solid ${C.border}; border-radius:12px; padding:5px; transition:border-color .15s, box-shadow .15s; }
        .route_row:focus-within { border-color:${C.jade}; box-shadow:0 0 0 3px rgba(47,75,255,.2); }
        .route_row label.rh_field { background:transparent; border:none; border-radius:8px; }
        .route_row label.rh_field:focus-within { background:transparent; border:none; box-shadow:none; }
        .route_row .rh_from input { text-align:left; }
        .route_row .rh_to input { text-align:right; }
        .route_row input { height:52px; padding:8px 14px; font-size:23px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; }
        .route_row input::placeholder { color:${C.ink3}; font-weight:700; }
        .route_row i.clear_from, .route_row i.clear_to { display:none; }

        a.switch { flex:0 0 42px; align-self:center; display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; background:${C.subtle}; border:1px solid ${C.border}; border-radius:50%; box-shadow:0 2px 7px rgba(0,0,0,.3); text-decoration:none; transition:transform .25s, box-shadow .15s, background .15s; }
        a.switch:hover { transform:rotate(180deg); background:${C.borderStrong}; box-shadow:0 3px 11px rgba(0,0,0,.4); }
        a.switch:active { transform:rotate(180deg) scale(.9); }
        a.switch svg { width:18px; height:18px; }
        a.switch svg path { fill:${C.jade}; }

        /* 日期 + 旅客列 */
        .meta_row { display:grid; grid-template-columns:1.7fr 1fr 1fr; gap:8px; }
        .meta_row input { height:58px; padding:25px 12px 9px 14px; font-size:17px; font-weight:600; }

        /* 整寬漸層搜尋鈕 */
        .labels button.uef_search { height:52px; border:none; border-radius:10px; background:${C.jade}; color:#fff; font-size:16px; font-weight:700; letter-spacing:.4px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-shadow:0 4px 14px rgba(47,75,255,.24); transition:background .15s, transform .08s, box-shadow .15s; }
        .labels button.uef_search:hover { background:${C.jadeDark}; box-shadow:0 6px 18px rgba(47,75,255,.32); }
        .labels button.uef_search:active { transform:translateY(1px); }
        .uef_search.searching { background:${C.borderStrong} !important; color:${C.ink2} !important; box-shadow:none; pointer-events:none; }
        .bulk_searching { background:${C.borderStrong} !important; color:${C.ink2} !important; } /* 兼任停止鈕，不可設 pointer-events:none */


        /* ── multi box ── */
        .multi_box { display:flex; flex-wrap:wrap; gap:8px; align-items:stretch; background:${C.surface}; border:1px solid ${C.border}; border-top:none; padding:0 14px 12px; }
        .multi_box.hidden { display:none; }
        .multi_box select { flex:1 1 35%; min-width:140px; height:46px; border:1px solid ${C.borderStrong}; border-radius:8px; padding:10px; background:${C.surface}; font-size:14px; }
        .multi_box label { position:relative; flex:1 1 80px; margin:0; }
        .multi_box label > span { position:absolute; top:5px; left:10px; color:${C.ink2}; font-size:10px; }
        .multi_box input { width:100%; height:46px; padding:19px 8px 5px 10px; border:1px solid ${C.borderStrong}; border-radius:8px; font-size:15px; }
        .multi_box a.multi_search { flex:1 1 25%; display:flex; align-items:center; justify-content:center; text-align:center; background:${C.subtle}; color:${C.ink}; border:1px solid ${C.border}; border-radius:8px; padding:0 12px; font-size:12px; line-height:1.3; text-decoration:none; transition:background .15s, border-color .15s; }
        .multi_box a.multi_search:hover { background:${C.borderStrong}; border-color:${C.borderStrong}; }

        /* ── faves panel ── */
        .cx_faves { position:absolute; top:52px; left:14px; right:14px; bottom:0; z-index:100; overflow:hidden; background:${C.panel}; border:1px solid ${C.border}; border-radius:10px; box-shadow:inset 0 0 8px rgba(0,0,0,.25); transition:opacity .25s; }
        .cx_faves_hidden { opacity:0; pointer-events:none; }
        .faves_tabs { margin:8px 0 0 10px; }
        .faves_tabs a.tabs { display:inline-block; border-radius:8px 8px 0 0; text-decoration:none; font-size:12px; padding:6px 12px; margin-right:4px; }
        .cx_faves .tab_queries, .cx_faves.flights .tab_flights { background:${C.jade}; color:#fff; }
        .cx_faves .tab_flights, .cx_faves.flights .tab_queries { background:${C.subtle}; color:${C.ink2}; }
        a.search_selected { position:absolute; right:14px; top:10px; font-size:12px; font-weight:600; }
        .cx_faves.flights a.search_selected, .multi_on a.search_selected { display:none; }
        .cx_faves .saved_queries, .cx_faves .saved_flights { list-style:none; margin:0 10px; padding:0; border-top:2px solid ${C.jade}; position:absolute; left:0; right:0; bottom:0; top:34px; overflow:auto; }
        .cx_faves .saved_queries { display:block; }
        .cx_faves .saved_flights { display:none; }
        .cx_faves.flights .saved_queries { display:none; }
        .cx_faves.flights .saved_flights { display:block; }
        .saved_queries:empty:after, .saved_flights:empty:after { display:flex; content:"${lang.nosaves}"; text-align:center; font-size:13px; align-items:center; justify-content:center; height:90%; opacity:.45; line-height:1.6; margin:0 25px; }
        .saved_query, .saved_flight { position:relative; margin:0; padding:6px 10px; font-size:12px; }
        .saved_query:nth-child(odd), .saved_flight:nth-child(odd) { background:${C.surface}; }
        .saved_query label { margin:0; min-width:150px; display:inline-block; }
        .saved_query input, .saved_flight input { vertical-align:-2px; margin-right:6px; }
        .saved_book { margin-left:10px; font-weight:600; display:inline-block; }
        .saved_remove { position:absolute; right:6px; top:5px; font-weight:600; }
        .saved_remove svg { height:18px; fill:${C.ink3}; }
        .saved_book *, .saved_remove * { pointer-events:none; }
        .leg { color:${C.amberDark}; font-weight:600; }
        .multi_on .search_multicity { display:block; }
        .multi_on .saved_book, .multi_on .saved_remove { display:none; }
        .saved_flight label > span { display:inline-block; vertical-align:top; }
        span.sf_date { display:block; margin-bottom:2px; color:${C.ink2}; }
        span.sf_route { background:${C.subtle}; padding:2px 6px; border-radius:6px 0 0 6px; display:inline-block; }
        span.sf_flights { background:${C.subtle}; padding:2px 6px; border-radius:0 6px 6px 0; display:inline-block; }
        span.sf_avail > span { display:inline-block; font-size:10px; line-height:1.4; padding:1px 5px; border-radius:4px; margin-left:3px; font-weight:600; }
        span.sf_avail .av_f { background:${C.fBg}; color:${C.fTx}; }
        span.sf_avail .av_j { background:${C.jBg}; color:${C.jTx}; }
        span.sf_avail .av_p { background:${C.pBg}; color:${C.pTx}; }
        span.sf_avail .av_y { background:${C.yBg}; color:${C.yTx}; }

        /* ── bulk box / results ── */
        .bulk_box { position:relative; z-index:9; min-height:56px; background:${C.surface}; border:1px solid ${C.border}; border-radius:0 0 14px 14px; box-shadow:0 10px 30px rgba(0,0,0,.35); margin-bottom:20px; }
        .bulk_results { margin:0 14px; transition:all .4s ease-out; }
        .bulk_results_hidden { height:0; min-height:0; margin:0; overflow:hidden; }
        .filters { position:sticky; top:0; z-index:10; text-align:center; font-size:13px; padding:12px 0; background:${C.surface}; border-bottom:1px solid ${C.border}; }
        .filters label { display:inline-block; margin:0 8px; cursor:pointer; }
        .filters input { vertical-align:-2px; margin-right:5px; accent-color:${C.jade}; }
        .filters .lf input { accent-color:#B4476B; } .filters .lj input { accent-color:#1C5AA0; }
        .filters .lp input { accent-color:${C.jade}; } .filters .ly input { accent-color:#5C8A22; }

        .bulk_table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
        .bulk_table th { background:${C.subtle}; font-weight:600; font-size:12px; padding:8px; border:1px solid ${C.border}; }
        .bulk_table td { background:${C.surface}; border:1px solid ${C.border}; padding:8px; vertical-align:top; }
        .bulk_table tr:nth-child(even) td { background:#1E252C; }
        .bulk_table .bulk_date { width:84px; text-align:center; }
        .bulk_table .bulk_date a { text-decoration:none; font-weight:600; color:${C.jade}; display:block; margin-bottom:3px; }
        .bulk_table .bulk_date a:hover { text-decoration:underline; }
        .bulk_table td.bulk_flights { padding:8px 8px 3px; line-height:0; }
        .bulk_flights > div:only-child .flight_title { display:none; }
        .flight_title { display:block; background:${C.pBg}; color:${C.jadeDark}; font-size:12px; line-height:1.3; padding:4px 8px; margin:0 0 8px; border-radius:6px; position:relative; font-weight:600; }
        .bulk_go_book { float:right; margin-left:10px; font-weight:600; }
        a.bulk_save { float:left; margin-right:8px; text-decoration:none !important; }
        a.bulk_save svg.heart_save { width:13px; height:13px; vertical-align:-1px; }
        a.bulk_save svg.heart_save path { fill:${C.ink3}; }
        a.bulk_saved svg.heart_save path { fill:#D65C5C; }
        a.bulk_save *, a.bulk_go_book * { pointer-events:none; }

        .flight_list:empty:after { display:block; content:"${lang.no_flights}"; height:22px; line-height:22px; margin:0 0 6px 2px; color:${C.ink3}; font-size:12px; }
        .bulk_response_error { display:block; padding:2px 5px 6px; color:${C.errTx}; line-height:1.5; }

        /* ── flight pill ── */
        .flight_wrapper { position:relative; display:inline-block; }
        .flight_item { display:inline-flex; align-items:center; gap:5px; vertical-align:top; overflow:hidden; white-space:nowrap; font-size:12px; font-weight:500; line-height:18px; border:1px solid ${C.border}; border-radius:8px; background:${C.surface}; cursor:pointer; transition:max-width .35s ease, padding .2s, margin .2s; max-width:0; padding:7px 0; margin:0 0 6px; }
        .show_first .flight_item[data-f="1"], .show_business .flight_item[data-j="1"], .show_premium .flight_item[data-p="1"], .show_economy .flight_item[data-y="1"] { max-width:340px; padding:7px 9px; margin:0 6px 6px 0; }
        .nonstop_only .flight_item[data-direct="0"] { max-width:0 !important; padding:7px 0 !important; margin:0 0 6px !important; }
        .flight_item.direct { background:${C.pBg}; border-color:#CDE9DF; }
        .flight_item.saved { background:#2A2310; border-color:#4A3D1C; }
        .flight_item img { max-height:15px; max-width:20px; vertical-align:middle; }
        .flight_item span.flight_num { color:${C.ink}; font-weight:600; }
        .flight_item span.stopover { background:${C.surface}; color:${C.ink2}; border:1px solid ${C.border}; border-radius:5px; padding:1px 5px; font-size:10px; margin:0 3px; line-height:14px; }
        .flight_item.direct span.stopover { background:rgba(255,255,255,.08); }
        .flight_item .chevron { opacity:.45; margin:0 -2px; height:16px; }
        .flight_item .chevron svg { vertical-align:top; transform:rotate(-90deg); transition:transform .2s; }
        .flight_item.active .chevron svg { transform:rotate(0deg); }
        .flight_item * { pointer-events:none; }
        .flight_item .flight_save { pointer-events:auto; }
        span.bulk_f, span.bulk_j, span.bulk_p, span.bulk_y { display:inline-block; vertical-align:top; overflow:hidden; font-size:11px; font-weight:600; line-height:16px; height:18px; border-radius:5px; transition:max-width .35s ease, padding .2s, margin .2s; max-width:0; padding:1px 0; margin-left:0; }
        span.bulk_f b, span.bulk_j b, span.bulk_p b, span.bulk_y b { font-weight:700; }
        span.bulk_f { background:${C.fBg}; color:${C.fTx}; } span.bulk_j { background:${C.jBg}; color:${C.jTx}; }
        span.bulk_p { background:${C.pBg}; color:${C.pTx}; } span.bulk_y { background:${C.yBg}; color:${C.yTx}; }
        .show_first span.bulk_f, .show_business span.bulk_j, .show_premium span.bulk_p, .show_economy span.bulk_y { max-width:60px; padding:1px 6px; margin-left:3px; }
        span.flight_save { display:none; position:absolute; left:6px; top:6px; opacity:.7; }
        span.flight_save svg { height:12px; width:12px; padding:4px; }
        .flight_item.saved span.flight_save { display:block; opacity:1; }
        .flight_item.saved span.flight_save svg.heart_save path { fill:#D65C5C; }
        .flight_item:hover span.flight_save, .flight_item.active span.flight_save { display:inline-block; }

        .flight_info { display:none; position:absolute; left:0; top:40px; z-index:15; background:${C.surface}; border:1px solid ${C.border}; border-radius:8px; padding:8px 12px; line-height:1.5; white-space:nowrap; box-shadow:0 8px 22px rgba(0,0,0,.45); }
        .flight_item.active + .flight_info { display:block; }
        .flight_info > span { display:block; }
        .flight_info span.info_flight { font-weight:600; }
        .info_dept > span, .info_arr > span { display:inline-block; width:54px; color:${C.ink3}; font-weight:600; }
        span.info_transit, span.info_duration { margin:6px 0; background:${C.subtle}; border-radius:5px; padding:2px 8px; text-align:center; font-size:11px; color:${C.ink2}; }

        /* ── footer ── */
        .bulk_footer { position:sticky; bottom:0; min-height:46px; }
        .bulk_footer .bulk_footer_container { padding:10px 14px; background:${C.surface}; border-radius:0 0 12px 12px; }
        .bulk_footer.bulk_sticky .bulk_footer_container { border-top:1px solid ${C.border}; box-shadow:0 -2px 10px rgba(0,0,0,.3); }
        button.bulk_submit { position:relative; display:block; width:100%; height:46px; border:1px solid ${C.border}; border-radius:8px; background:${C.subtle}; color:${C.ink}; font-size:15px; font-weight:600; cursor:pointer; transition:background .15s, border-color .15s; }
        button.bulk_submit:hover { background:${C.borderStrong}; border-color:${C.borderStrong}; }
        .bulk_searching.bulk_submit { background:${C.borderStrong} !important; color:${C.ink2} !important; }

        span.info-x { border-radius:5px; padding:1px 6px; margin-left:5px; font-size:10px; font-weight:600; }
        span.info-f { background:${C.fBg}; color:${C.fTx}; } span.info-j { background:${C.jBg}; color:${C.jTx}; }
        span.info-p { background:${C.pBg}; color:${C.pTx}; } span.info-y { background:${C.yBg}; color:${C.yTx}; }

        .bulk_error span { display:block; overflow:hidden; text-align:center; font-size:12px; color:${C.errTx}; background:${C.errBg}; border-radius:8px; margin-top:10px; padding:7px; transition:all .3s ease-out; }
        .bulk_error_hidden span { height:0; margin-top:0; padding:0; }

        /* ── autocomplete ── */
        .autocomplete-items { position:absolute; top:100%; left:0; right:0; margin-top:-2px; z-index:99; max-height:220px; overflow:auto; background:${C.surface}; border:1px solid ${C.borderStrong}; border-top:none; border-radius:0 0 8px 8px; box-shadow:0 10px 26px rgba(0,0,0,.45); }
        .autocomplete-items div { padding:7px 10px; cursor:pointer; border-bottom:1px solid ${C.subtle}; font-size:12px; white-space:nowrap; overflow:hidden; }
        .autocomplete-items div span.sa_code { display:inline-block; width:34px; margin-left:4px; font-weight:600; }
        .autocomplete-items div span.sc_code { color:${C.ink3}; margin-left:8px; }
        .autocomplete-items div:hover { background:${C.subtle}; }
        .autocomplete-active, .autocomplete-active span.sc_code { background:${C.jade} !important; color:#fff !important; }

        /* ============================================================
           v6 — 餘位矩陣 heatmap + 展開航班
           ============================================================ */
        /* toolbar（篩選 + 排序 + 進度） */
        .toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px 12px; flex-wrap:wrap; position:sticky; top:0; z-index:10; background:${C.surface}; border-bottom:1px solid ${C.border}; padding:10px 2px; }
        .toolbar .filters { position:static; display:flex; gap:6px; flex-wrap:wrap; border:none; padding:0; background:none; text-align:left; }
        .toolbar .fl { display:inline-flex; align-items:center; gap:5px; font-size:12px; border:1px solid ${C.border}; border-radius:999px; padding:4px 11px; cursor:pointer; user-select:none; transition:background .15s, border-color .15s; }
        .toolbar .fl input { width:13px; height:13px; margin:0; accent-color:${C.jade}; }
        .toolbar .fl span { color:${C.ink3}; }
        .toolbar .fl input:checked + span { color:${C.ink}; font-weight:600; }
        .toolbar .fl.lf input { accent-color:#B4476B; } .toolbar .fl.lf input:checked + span { color:#B4476B; }
        .toolbar .fl.lj input { accent-color:#1C5AA0; } .toolbar .fl.lj input:checked + span { color:#1C5AA0; }
        .toolbar .fl.lp input { accent-color:${C.jade}; } .toolbar .fl.lp input:checked + span { color:${C.jade}; }
        .toolbar .fl.ly input { accent-color:#5C8A22; } .toolbar .fl.ly input:checked + span { color:#5C8A22; }
        .toolbar_meta { display:flex; align-items:center; gap:10px; font-size:12px; color:${C.ink2}; }
        .sort_wrap select { margin-left:6px; border:1px solid ${C.borderStrong}; border-radius:8px; padding:4px 6px; font-size:12px; background:${C.surface}; color:${C.ink}; }
        .progress { font-size:12px; color:${C.ink2}; background:${C.subtle}; border-radius:999px; padding:3px 10px; font-variant-numeric:tabular-nums; }
        .clear_cache { font-size:12px; color:${C.amberDark}; text-decoration:none; border:1px solid ${C.border}; border-radius:999px; padding:3px 10px; cursor:pointer; transition:background .15s, border-color .15s; }
        .clear_cache:hover { background:${C.amber}; color:#fff; border-color:${C.amber}; }

        /* 矩陣表頭與列（6 欄 grid：日期 F J PY Y chevron） */
        .matrix { margin-top:2px; }
        .matrix_head, .day_main { display:grid; grid-template-columns:1.7fr 1fr 1fr 1fr 1fr 22px; gap:6px; align-items:center; }
        .matrix_head { position:sticky; top:45px; z-index:9; background:${C.surface}; padding:8px 6px; font-size:12px; font-weight:600; color:${C.ink2}; border-bottom:1px solid ${C.border}; }
        .matrix_head .mh_date { text-align:left; }
        .matrix_head .mh_cabin { text-align:center; }
        .mh_cabin.cF { color:#B4476B; } .mh_cabin.cJ { color:#1C5AA0; } .mh_cabin.cP { color:${C.jade}; } .mh_cabin.cY { color:#5C8A22; }

        .day { border-bottom:1px solid ${C.subtle}; }
        .day_main { position:relative; width:100%; border:none; background:none; padding:9px 6px; cursor:pointer; text-align:left; font:inherit; }
        .day_main:hover { background:#1E252C; }
        .day.empty .day_main:hover { background:transparent; }
        .day_date b { display:block; font-size:13px; color:${C.jade}; font-weight:600; }
        .day_date i { font-style:normal; font-size:11px; color:${C.ink3}; }
        .day_cells { display:contents; }
        .day_chev svg { transition:transform .2s; opacity:.4; }
        .day_chev svg { transform:rotate(-90deg); }
        .day.open .day_chev svg { transform:rotate(0deg); }

        .cell { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; min-height:40px; border-radius:8px; position:relative; font-variant-numeric:tabular-nums; }
        .cell .cl { display:none; font-style:normal; font-size:9px; font-weight:600; opacity:.75; }
        .cell b { font-size:14px; font-weight:700; line-height:1; }
        .cell .bar { height:3px; width:64%; border-radius:2px; background:currentColor; opacity:.3; transform:scaleX(var(--w,0)); transform-origin:left; transition:transform .3s ${C.ease || "ease"}; }
        .cell.lvl0 { color:${C.ink3}; background:repeating-linear-gradient(45deg, ${C.panel}, ${C.panel} 4px, ${C.surface} 4px, ${C.surface} 8px); }
        .cell.lvl0 b { font-weight:400; } .cell.lvl0 .bar { display:none; }
        .cell.direct::before { content:""; position:absolute; top:5px; right:7px; width:6px; height:6px; border-radius:50%; background:currentColor; opacity:.85; }
        .cell.cF.lvl1 { background:#3A2F12; color:#E2BE64; } .cell.cF.lvl2 { background:#6B561F; color:#F0DDA8; } .cell.cF.lvl3 { background:#E2BE64; color:#1A130A; }
        .cell.cJ.lvl1 { background:#10302A; color:#3BB39C; } .cell.cJ.lvl2 { background:#1A5347; color:#8FE0D2; } .cell.cJ.lvl3 { background:#3BB39C; color:#07150F; }
        .cell.cP.lvl1 { background:#241D3A; color:#B39CFF; } .cell.cP.lvl2 { background:#3B2F66; color:#D6CBFF; } .cell.cP.lvl3 { background:#B39CFF; color:#16112A; }
        .cell.cY.lvl1 { background:#15263A; color:#5AA9E6; } .cell.cY.lvl2 { background:#1F4368; color:#A9D3F2; } .cell.cY.lvl3 { background:#5AA9E6; color:#0A1A2A; }

        /* 篩選艙等：隱藏整欄（用 visibility 維持 grid 對齊） */
        .matrix:not(.show_first) .cF { visibility:hidden; }
        .matrix:not(.show_business) .cJ { visibility:hidden; }
        .matrix:not(.show_premium) .cP { visibility:hidden; }
        .matrix:not(.show_economy) .cY { visibility:hidden; }

        /* 展開明細 */
        .day_detail[hidden] { display:none; }
        .day_detail .flight_list { padding:2px 4px 12px; }
        .day_detail .flight_list:empty:after { content:"${lang.no_flights}"; display:block; color:${C.ink3}; font-size:12px; padding:8px 4px; }
        .route_head { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:${C.ink2}; background:${C.subtle}; border-radius:6px; padding:5px 9px; margin:8px 0 6px; }
        .route_head .route_name { flex:1; }
        .route_head a { text-decoration:none; }
        .route_head .bulk_save svg { width:13px; height:13px; vertical-align:-1px; }
        .route_head .bulk_save svg path { fill:${C.ink3}; }
        .route_head .bulk_saved svg path { fill:#D65C5C; }
        .route_head .bulk_go_book { color:${C.jade}; font-weight:600; }
        .route_head .bulk_save *, .route_head .bulk_go_book * { pointer-events:none; }
        .route_error { color:${C.errTx}; font-size:12px; padding:6px 4px; line-height:1.5; }

        .frow { display:grid; grid-template-columns:22px 1fr auto; grid-template-areas:"logo num badges" "logo sub sub"; gap:2px 8px; align-items:center; padding:8px 30px 8px 8px; border:1px solid ${C.border}; border-radius:8px; margin:6px 0; background:${C.surface}; position:relative; }
        .frow.direct { background:#10302A; border-color:#1A5347; }
        .frow.saved { background:#2A2310; border-color:#4A3D1C; }
        .frow .fr_logo { grid-area:logo; max-width:20px; max-height:15px; }
        .fr_num { grid-area:num; font-size:13px; font-weight:600; color:${C.ink}; }
        .fr_num .stopover { font-size:10px; color:${C.ink2}; background:${C.subtle}; border-radius:5px; padding:1px 5px; margin:0 4px; }
        .fr_badges { grid-area:badges; display:flex; gap:4px; }
        .fr_badges .bg { font-size:11px; font-weight:700; border-radius:5px; padding:1px 6px; font-variant-numeric:tabular-nums; }
        .fr_badges .bF { background:${C.fBg}; color:${C.fTx}; } .fr_badges .bJ { background:${C.jBg}; color:${C.jTx}; }
        .fr_badges .bP { background:${C.pBg}; color:${C.pTx}; } .fr_badges .bY { background:${C.yBg}; color:${C.yTx}; }
        .fr_sub { grid-area:sub; font-size:11px; color:${C.ink2}; font-variant-numeric:tabular-nums; }
        .frow .flight_save { position:absolute; top:50%; right:8px; transform:translateY(-50%); opacity:0; cursor:pointer; }
        .frow:hover .flight_save, .frow.saved .flight_save { opacity:1; }
        .frow .flight_save svg { width:14px; height:14px; }
        .frow .flight_save svg path { fill:${C.ink3}; }
        .frow.saved .flight_save svg path { fill:#D65C5C; }

        /* 帶回 App：常駐藍色 pill，heart 往左讓位 */
        .frow.has-pick { padding-right:78px; }
        .frow.has-pick .flight_save { right:62px; }
        .frow .flight_pick { position:absolute; top:50%; right:8px; transform:translateY(-50%); font-size:11px; font-weight:700; color:#fff; background:${C.jade}; border-radius:6px; padding:4px 9px; text-decoration:none; white-space:nowrap; transition:background .15s, color .15s; }
        .frow .flight_pick:hover { background:${C.jadeDark}; }
        .frow .flight_pick.picked { background:${C.jTx}; color:#07150F; }

        /* 直飛篩選：明細隱藏轉機航班 */
        .matrix.nonstop_only .frow[data-direct="0"] { display:none; }

        @media screen and (prefers-reduced-motion: reduce) {
            .cell .bar, .day_chev svg { transition:none; }
        }

    `;
	}
	function isValidDate(dateString) {
		if (!/^\d{8}$/.test(dateString)) return false;
		let year = dateString.substring(0, 4);
		let month = dateString.substring(4, 6);
		let day = dateString.substring(6, 8);
		if (year < 1e3 || year > 3e3 || month == 0 || month > 12) return false;
		let monthLength = [
			31,
			28,
			31,
			30,
			31,
			30,
			31,
			31,
			30,
			31,
			30,
			31
		];
		if (year % 400 == 0 || year % 100 != 0 && year % 4 == 0) monthLength[1] = 29;
		if (day <= 0 || day > monthLength[month - 1]) return false;
		let today = new Date();
		let date = new Date(year, month - 1, day);
		if ((date - today) / 24 / 60 / 60 / 1e3 >= 366 || (date - today) / 24 / 60 / 60 / 1e3 < -1) return false;
		return true;
	}
	function dateAdd(days = 0, date = false) {
		let new_date = new Date();
		if (date) {
			let year = +date.substring(0, 4);
			let month = +date.substring(4, 6);
			let day = +date.substring(6, 8);
			new_date = new Date(year, month - 1, day);
		}
		new_date.setDate(new_date.getDate() + days);
		return new_date.getFullYear() + "" + (new_date.getMonth() + 1).toString().padStart(2, "0") + new_date.getDate().toString().padStart(2, "0");
	}
	function toDashedDate(date) {
		return date.substring(0, 4).toString() + "-" + date.substring(4, 6).toString().padStart(2, "0") + "-" + date.substring(6, 8).toString().padStart(2, "0");
	}
	function dateWeekday(date) {
		return {
			1: "週一",
			2: "週二",
			3: "週三",
			4: "週四",
			5: "週五",
			6: "週六",
			0: "週日"
		}[new Date(+date.substring(0, 4), +date.substring(4, 6) - 1, +date.substring(6, 8)).getDay()];
	}
	function getFlightTime(timestamp, timeonly = false) {
		let date = new Date(timestamp);
		if (timeonly) {
			let hours = (date.getUTCDate() - 1) * 24 + date.getUTCHours();
			return (hours > 0 ? hours.toString() + "hr " : "") + date.getUTCMinutes().toString() + "mins";
		} else return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0") + " " + date.getUTCHours().toString().padStart(2, "0") + ":" + date.getUTCMinutes().toString().padStart(2, "0");
	}
	var store$4;
	var DEFAULT_CONFIG = {
		lang: void 0,
		message: void 0,
		abortEarly: void 0,
		abortPipeEarly: void 0
	};
	function getGlobalConfig(config$1) {
		if (!config$1 && !store$4) return DEFAULT_CONFIG;
		return {
			lang: config$1?.lang ?? store$4?.lang,
			message: config$1?.message,
			abortEarly: config$1?.abortEarly ?? store$4?.abortEarly,
			abortPipeEarly: config$1?.abortPipeEarly ?? store$4?.abortPipeEarly
		};
	}
	var store$3;
	function getGlobalMessage(lang) {
		return store$3?.get(lang);
	}
	var store$2;
	function getSchemaMessage(lang) {
		return store$2?.get(lang);
	}
	var store$1;
	function getSpecificMessage(reference, lang) {
		return store$1?.get(reference)?.get(lang);
	}
	function _stringify(input) {
		const type = typeof input;
		if (type === "string") return `"${input}"`;
		if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
		if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
		return type;
	}
	function _addIssue(context, label, dataset, config$1, other) {
		const input = other && "input" in other ? other.input : dataset.value;
		const expected = other?.expected ?? context.expects ?? null;
		const received = other?.received ?? _stringify(input);
		const issue = {
			kind: context.kind,
			type: context.type,
			input,
			expected,
			received,
			message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
			requirement: context.requirement,
			path: other?.path,
			issues: other?.issues,
			lang: config$1.lang,
			abortEarly: config$1.abortEarly,
			abortPipeEarly: config$1.abortPipeEarly
		};
		const isSchema = context.kind === "schema";
		const message$1 = other?.message ?? context.message ?? getSpecificMessage(context.reference, issue.lang) ?? (isSchema ? getSchemaMessage(issue.lang) : null) ?? config$1.message ?? getGlobalMessage(issue.lang);
		if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
		if (isSchema) dataset.typed = false;
		if (dataset.issues) dataset.issues.push(issue);
		else dataset.issues = [issue];
	}
	var _standardCache = new WeakMap();
	function _getStandardProps(context) {
		let cached = _standardCache.get(context);
		if (!cached) {
			cached = {
				version: 1,
				vendor: "valibot",
				validate(value$1) {
					return context["~run"]({ value: value$1 }, getGlobalConfig());
				}
			};
			_standardCache.set(context, cached);
		}
		return cached;
	}
	function _isValidObjectKey(object$1, key) {
		return Object.prototype.hasOwnProperty.call(object$1, key) && key !== "__proto__" && key !== "prototype" && key !== "constructor";
	}
	function getFallback(schema, dataset, config$1) {
		return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
	}
	function getDefault(schema, dataset, config$1) {
		return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
	}
	function any() {
		return {
			kind: "schema",
			type: "any",
			reference: any,
			expects: "any",
			async: false,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset) {
				dataset.typed = true;
				return dataset;
			}
		};
	}
	function array(item, message$1) {
		return {
			kind: "schema",
			type: "array",
			reference: array,
			expects: "Array",
			async: false,
			item,
			message: message$1,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset, config$1) {
				const input = dataset.value;
				if (Array.isArray(input)) {
					dataset.typed = true;
					dataset.value = [];
					for (let key = 0; key < input.length; key++) {
						const value$1 = input[key];
						const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
						if (itemDataset.issues) {
							const pathItem = {
								type: "array",
								origin: "value",
								input,
								key,
								value: value$1
							};
							for (const issue of itemDataset.issues) {
								if (issue.path) issue.path.unshift(pathItem);
								else issue.path = [pathItem];
								dataset.issues?.push(issue);
							}
							if (!dataset.issues) dataset.issues = itemDataset.issues;
							if (config$1.abortEarly) {
								dataset.typed = false;
								break;
							}
						}
						if (!itemDataset.typed) dataset.typed = false;
						dataset.value.push(itemDataset.value);
					}
				} else _addIssue(this, "type", dataset, config$1);
				return dataset;
			}
		};
	}
	function boolean(message$1) {
		return {
			kind: "schema",
			type: "boolean",
			reference: boolean,
			expects: "boolean",
			async: false,
			message: message$1,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset, config$1) {
				if (typeof dataset.value === "boolean") dataset.typed = true;
				else _addIssue(this, "type", dataset, config$1);
				return dataset;
			}
		};
	}
	function object(entries$1, message$1) {
		return {
			kind: "schema",
			type: "object",
			reference: object,
			expects: "Object",
			async: false,
			entries: entries$1,
			message: message$1,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset, config$1) {
				const input = dataset.value;
				if (input && typeof input === "object") {
					dataset.typed = true;
					dataset.value = {};
					for (const key in this.entries) {
						const valueSchema = this.entries[key];
						if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
							const value$1 = key in input ? input[key] : getDefault(valueSchema);
							const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
							if (valueDataset.issues) {
								const pathItem = {
									type: "object",
									origin: "value",
									input,
									key,
									value: value$1
								};
								for (const issue of valueDataset.issues) {
									if (issue.path) issue.path.unshift(pathItem);
									else issue.path = [pathItem];
									dataset.issues?.push(issue);
								}
								if (!dataset.issues) dataset.issues = valueDataset.issues;
								if (config$1.abortEarly) {
									dataset.typed = false;
									break;
								}
							}
							if (!valueDataset.typed) dataset.typed = false;
							dataset.value[key] = valueDataset.value;
						} else if (valueSchema.fallback !== void 0) dataset.value[key] = getFallback(valueSchema);
						else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
							_addIssue(this, "key", dataset, config$1, {
								input: void 0,
								expected: `"${key}"`,
								path: [{
									type: "object",
									origin: "key",
									input,
									key,
									value: input[key]
								}]
							});
							if (config$1.abortEarly) break;
						}
					}
				} else _addIssue(this, "type", dataset, config$1);
				return dataset;
			}
		};
	}
	function optional(wrapped, default_) {
		return {
			kind: "schema",
			type: "optional",
			reference: optional,
			expects: `(${wrapped.expects} | undefined)`,
			async: false,
			wrapped,
			default: default_,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset, config$1) {
				if (dataset.value === void 0) {
					if (this.default !== void 0) dataset.value = getDefault(this, dataset, config$1);
					if (dataset.value === void 0) {
						dataset.typed = true;
						return dataset;
					}
				}
				return this.wrapped["~run"](dataset, config$1);
			}
		};
	}
	function record(key, value$1, message$1) {
		return {
			kind: "schema",
			type: "record",
			reference: record,
			expects: "Object",
			async: false,
			key,
			value: value$1,
			message: message$1,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset, config$1) {
				const input = dataset.value;
				if (input && typeof input === "object") {
					dataset.typed = true;
					dataset.value = {};
					for (const entryKey in input) if (_isValidObjectKey(input, entryKey)) {
						const entryValue = input[entryKey];
						const keyDataset = this.key["~run"]({ value: entryKey }, config$1);
						if (keyDataset.issues) {
							const pathItem = {
								type: "object",
								origin: "key",
								input,
								key: entryKey,
								value: entryValue
							};
							for (const issue of keyDataset.issues) {
								issue.path = [pathItem];
								dataset.issues?.push(issue);
							}
							if (!dataset.issues) dataset.issues = keyDataset.issues;
							if (config$1.abortEarly) {
								dataset.typed = false;
								break;
							}
						}
						const valueDataset = this.value["~run"]({ value: entryValue }, config$1);
						if (valueDataset.issues) {
							const pathItem = {
								type: "object",
								origin: "value",
								input,
								key: entryKey,
								value: entryValue
							};
							for (const issue of valueDataset.issues) {
								if (issue.path) issue.path.unshift(pathItem);
								else issue.path = [pathItem];
								dataset.issues?.push(issue);
							}
							if (!dataset.issues) dataset.issues = valueDataset.issues;
							if (config$1.abortEarly) {
								dataset.typed = false;
								break;
							}
						}
						if (!keyDataset.typed || !valueDataset.typed) dataset.typed = false;
						if (keyDataset.typed) dataset.value[keyDataset.value] = valueDataset.value;
					}
				} else _addIssue(this, "type", dataset, config$1);
				return dataset;
			}
		};
	}
	function string(message$1) {
		return {
			kind: "schema",
			type: "string",
			reference: string,
			expects: "string",
			async: false,
			message: message$1,
			get "~standard"() {
				return _getStandardProps(this);
			},
			"~run"(dataset, config$1) {
				if (typeof dataset.value === "string") dataset.typed = true;
				else _addIssue(this, "type", dataset, config$1);
				return dataset;
			}
		};
	}
	function safeParse(schema, input, config$1) {
		const dataset = schema["~run"]({ value: input }, getGlobalConfig(config$1));
		return {
			typed: dataset.typed,
			success: !dataset.issues,
			output: dataset.value,
			issues: dataset.issues
		};
	}
	var PageBomSchema = object({ modelObject: optional(object({
		isContainingErrors: optional(boolean()),
		messages: optional(array(object({ text: optional(string()) }))),
		availabilities: optional(object({ upsell: optional(object({
			associations: optional(record(string(), any())),
			bounds: optional(array(any()))
		})) }))
	})) });
	function parseAvailability(raw) {
		const r = safeParse(PageBomSchema, raw);
		const mo = r.success ? r.output.modelObject : void 0;
		return {
			error: !!mo?.isContainingErrors,
			message: mo?.messages?.[0]?.text ?? "",
			upsell: mo?.availabilities?.upsell ?? null
		};
	}
	function toCompactBom(raw) {
		const parsed = parseAvailability(raw);
		return { modelObject: {
			isContainingErrors: parsed.error,
			messages: parsed.message ? [{ text: parsed.message }] : [],
			availabilities: { upsell: parsed.upsell }
		} };
	}
	function createGmStore(debug = false) {
		return {
			get(name, def) {
				return GM_getValue(name, def);
			},
			set(name, val) {
				GM_setValue(name, val);
				return val;
			},
			log(data) {
				if (debug) GM_log(data);
			}
		};
	}
	function createAvailCache(store, ttl, storeKey = "avail_cache") {
		const cache = store.get(storeKey, {});
		const now0 = Date.now();
		for (const k of Object.keys(cache)) if (!cache[k] || now0 - cache[k].ts >= ttl) delete cache[k];
		let timer = null;
		const persistSoon = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				const now = Date.now();
				for (const k of Object.keys(cache)) if (now - cache[k].ts >= ttl) delete cache[k];
				store.set(storeKey, cache);
			}, 800);
		};
		const key = (from, to, date) => from + "_" + to + "_" + date;
		return {
			key,
			get(from, to, date) {
				const e = cache[key(from, to, date)];
				if (e && Date.now() - e.ts < ttl) return e.bom;
				return null;
			},
			set(from, to, date, bom) {
				cache[key(from, to, date)] = {
					ts: Date.now(),
					bom
				};
				persistSoon();
			},
			clear() {
				for (const k of Object.keys(cache)) delete cache[k];
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				store.set(storeKey, cache);
			}
		};
	}
	var HttpAbortError = class extends Error {
		constructor() {
			super("aborted");
			this.name = "HttpAbortError";
		}
	};
	function gmHttp(req, signal) {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new HttpAbortError());
				return;
			}
			const http = new XMLHttpRequest();
			http.withCredentials = true;
			http.open(req.method, req.url, true);
			if (req.headers) for (const k of Object.keys(req.headers)) http.setRequestHeader(k, req.headers[k]);
			const onAbort = () => {
				http.abort();
				reject(new HttpAbortError());
			};
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			http.onreadystatechange = () => {
				if (http.readyState === 4) {
					if (signal) signal.removeEventListener("abort", onAbort);
					resolve({
						readyState: http.readyState,
						status: http.status,
						responseText: http.responseText
					});
				}
			};
			http.onerror = () => {
				if (signal) signal.removeEventListener("abort", onAbort);
				reject(new Error("network error"));
			};
			if (req.data) http.send(req.data);
			else http.send();
		});
	}
	var FARE_FAMILY = {
		FIRSTD: "f",
		BUSSTD: "j",
		PEYSTD: "p",
		ECOSTD: "y"
	};
	function seatLevel(n) {
		return n <= 0 ? 0 : n <= 2 ? 1 : n <= 6 ? 2 : 3;
	}
	var SEGMENT_CABIN_GROUPS = {
		f: ["F"],
		j: ["B"],
		p: ["N"],
		y: ["R", "E"]
	};
	function seatFromStatus(status) {
		const s = String(status);
		return /^\d+$/.test(s) ? parseInt(s, 10) : 0;
	}
	function availFromSegments(flight) {
		const res = {
			f: 0,
			j: 0,
			p: 0,
			y: 0
		};
		const segs = flight?.segments || [];
		if (!segs.length) return res;
		[
			"f",
			"j",
			"p",
			"y"
		].forEach((key) => {
			const codes = SEGMENT_CABIN_GROUPS[key];
			let seats = Infinity;
			for (const seg of segs) {
				const cabins = seg?.cabins || {};
				let found = false;
				let segSeats = 0;
				for (const code of codes) if (cabins[code]) {
					found = true;
					segSeats = Math.max(segSeats, seatFromStatus(cabins[code].status));
				}
				if (!found) {
					seats = 0;
					break;
				}
				seats = Math.min(seats, segSeats);
			}
			res[key] = seats === Infinity ? 0 : seats;
		});
		return res;
	}
	function availForFlight(upsell, flight) {
		const res = {
			f: 0,
			j: 0,
			p: 0,
			y: 0
		};
		const flightId = flight && typeof flight === "object" ? flight.id : flight;
		const assoc = upsell?.associations;
		if (assoc && Object.keys(assoc).length) {
			for (const ff of Object.keys(FARE_FAMILY)) {
				const key = FARE_FAMILY[ff];
				const lsa = assoc[ff + "_" + flightId]?.boundAssociations?.[0]?.lsa;
				if (typeof lsa === "number" && lsa > 0) res[key] = lsa;
			}
			return res;
		}
		if (flight && typeof flight === "object" && flight.segments) return availFromSegments(flight);
		return res;
	}
	var heart_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="heart_save" viewBox="0 0 16 16"><path d="M4 1c2.21 0 4 1.755 4 3.92C8 2.755 9.79 1 12 1s4 1.755 4 3.92c0 3.263-3.234 4.414-7.608 9.608a.513.513 0 0 1-.784 0C3.234 9.334 0 8.183 0 4.92 0 2.755 1.79 1 4 1z"></path></svg>`;
	var clear_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"></path></svg>`;
	var swap_svg = `<svg height="16" width="16" viewBox="0 0 365.352 365.352" xmlns="http://www.w3.org/2000/svg" transform="rotate(180)"><path d="M363.155,169.453l-14.143-14.143c-1.407-1.407-3.314-2.197-5.304-2.197c-1.989,0-3.897,0.79-5.304,2.197l-45.125,45.125v-57.503c0-50.023-40.697-90.721-90.721-90.721H162.3c-4.143,0-7.5,3.358-7.5,7.5v20c0,4.142,3.357,7.5,7.5,7.5h40.26c30.725,0,55.721,24.996,55.721,55.721v57.503l-45.125-45.125c-1.407-1.407-3.314-2.197-5.304-2.197c-1.989,0-3.896,0.79-5.304,2.197l-14.143,14.143c-1.406,1.406-2.196,3.314-2.196,5.303c0,1.989,0.79,3.897,2.196,5.303l82.071,82.071c1.465,1.464,3.385,2.197,5.304,2.197c1.919,0,3.839-0.732,5.304-2.197l82.071-82.071c1.405-1.406,2.196-3.314,2.196-5.303C365.352,172.767,364.561,170.859,363.155,169.453z"></path><path d="M203.052,278.14h-40.26c-30.725,0-55.721-24.996-55.721-55.721v-57.503l45.125,45.126c1.407,1.407,3.314,2.197,5.304,2.197c1.989,0,3.896-0.79,5.304-2.197l14.143-14.143c1.406-1.406,2.196-3.314,2.196-5.303c0-1.989-0.79-3.897-2.196-5.303l-82.071-82.071c-2.93-2.929-7.678-2.929-10.607,0L2.196,185.292C0.79,186.699,0,188.607,0,190.596c0,1.989,0.79,3.897,2.196,5.303l14.143,14.143c1.407,1.407,3.314,2.197,5.304,2.197s3.897-0.79,5.304-2.197l45.125-45.126v57.503c0,50.023,40.697,90.721,90.721,90.721h40.26c4.143,0,7.5-3.358,7.5-7.5v-20C210.552,281.498,207.194,278.14,203.052,278.14z"></path></svg>`;
	var trash_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="saved_delete" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"></path></svg>`;
	var chevron_svg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.34317 7.75732L4.92896 9.17154L12 16.2426L19.0711 9.17157L17.6569 7.75735L12 13.4142L6.34317 7.75732Z" fill="currentColor"></path></svg>`;
	function buildSearchBoxHTML(ctx) {
		const { lang, browserLang, version, vals } = ctx;
		return `
        <div class='cx_form'>
            <div class='cx_titlebar'>
                <div class='cx_title'><a href="https://www.cathaypacific.com/cx/${lang.el}_${lang.ec}/book-a-trip/redeem-flights/redeem-flight-awards.html">國泰里程票搜尋工具</a><span class='cx_ver'>${version}</span></div>
                <div class="cx_saved"><a href="javascript:void(0);">${heart_svg}<span>0</span></a></div>
            </div>

            <div class='cx_faves cx_faves_hidden'>
                <div class="faves_tabs">
                    <a href="javascript:void(0);" class="tabs tab_queries">航線</a>
                    <a href="javascript:void(0);" class="tabs tab_flights">航班</a>
                </div>
                <a href="javascript:void(0);" class="search_selected">${lang.search_selected} &raquo;</a>
                <div class="saved_flights"></div>
                <div class="saved_queries"></div>
            </div>

            <div class='labels'>
                <div class='route_row'>
                    <label class="rh_field rh_from">
                        <input tabindex="1" type='text' id='uef_from' name='uef_from' placeholder='TPE' value='${vals.from}' autocomplete='off'><i class="clear_from">${clear_svg}</i></label>
                    <a href="javascript:void(0);" class="switch" title="對調出發/目的">${swap_svg}</a>
                    <label class="rh_field rh_to">
                        <input tabindex="2" type='text' id='uef_to' name='uef_to' placeholder='HKG' value='${vals.to}' autocomplete='off'><i class="clear_to">${clear_svg}</i></label>
                </div>
                <div class='meta_row'>
                    <label class="rh_field rh_date"><span>日期</span>
                        <input tabindex="3" type='date' class='uef_date' id='uef_date' name='uef_date' value='${toDashedDate(vals.date)}' min='${toDashedDate(dateAdd(0))}' max='${toDashedDate(dateAdd(365))}'></label>
                    <label class="rh_field rh_pax"><span>大人</span>
                        <input tabindex="4" type='number' inputmode='decimal' onClick='this.select();' id='uef_adult' name='uef_adult' value='${vals.adult}'></label>
                    <label class="rh_field rh_pax"><span>孩童</span>
                        <input tabindex="5" type='number' inputmode='decimal' onClick='this.select();' id='uef_child' name='uef_child' value='${vals.child}'></label>
                </div>
                <button class='uef_search'>${lang.search} &rarr;</button>
            </div>
        </div>

        <div class='multi_box hidden'>
            <select id="multi_cabin">
                <option value="Y">${lang.economy_full}</option>
                <option value="W">${lang.premium_full}</option>
                <option value="C">${lang.business_full}</option>
                <option value="F">${lang.first_full}</option>
            </select>
            <label class="labels_right"><span>大人</span>
                <input type='number' inputmode='decimal' onClick='this.select();' id='multi_adult' value='1'></label>
            <label class="labels_right"><span>孩童</span>
                <input type='number' inputmode='decimal' onClick='this.select();' id='multi_child' value='0'></label>
            <a href="javascript:void(0)" class='multi_search'>${lang.multi_book}</a>
        </div>

        <div class='bulk_box'>
            <div class="bulk_results bulk_results_hidden">
                <div class="toolbar">
                    <div class="filters">
                        <label class="fl lf"><input type="checkbox" id="filter_first" checked><span>${lang.first}</span></label>
                        <label class="fl lj"><input type="checkbox" id="filter_business" checked><span>${lang.business}</span></label>
                        <label class="fl lp"><input type="checkbox" id="filter_premium" checked><span>${lang.premium}</span></label>
                        <label class="fl ly"><input type="checkbox" id="filter_economy" checked><span>${lang.economy}</span></label>
                        <label class="fl ln"><input type="checkbox" id="filter_nonstop"><span>${lang.nonstop}</span></label>
                    </div>
                    <div class="toolbar_meta">
                        <label class="sort_wrap">${browserLang == "zh" ? "排序" : "Sort"}
                            <select id="sort_by">
                                <option value="date">${browserLang == "zh" ? "日期" : "Date"}</option>
                                <option value="seats">${browserLang == "zh" ? "餘位多→少" : "Seats"}</option>
                            </select>
                        </label>
                        <span class="progress" hidden></span>
                        <a href="javascript:void(0);" class="clear_cache" title="${browserLang == "zh" ? "清除快取與目前結果，下次搜尋重新查詢" : "Clear cache & results"}">${browserLang == "zh" ? "清除快取" : "Clear cache"}</a>
                    </div>
                </div>
                <div class="matrix show_first show_business show_premium show_economy">
                    <div class="matrix_head">
                        <span class="mh_date">${lang.date}</span>
                        <span class="mh_cabin cF">${lang.first}</span>
                        <span class="mh_cabin cJ">${lang.business}</span>
                        <span class="mh_cabin cP">${lang.premium}</span>
                        <span class="mh_cabin cY">${lang.economy}</span>
                        <span class="mh_chev"></span>
                    </div>
                    <div class="day_list"></div>
                </div>
            </div>
            <div class="bulk_footer">
                <div class="bulk_footer_container">
                    <button class='bulk_submit'>${lang.search_20}</button>
                    <div class="bulk_error bulk_error_hidden"><span></span></div>
                </div>
            </div>
        </div>
    `;
	}
	var daysModel = van_default.state([]);
	var openDates = van_default.state(new Set());
	var sortMode = van_default.state("date");
	var activeCabins = van_default.state(new Set([
		"f",
		"j",
		"p",
		"y"
	]));
	var nonstopOnly = van_default.state(false);
	var savedRev = van_default.state(0);
	var errorMsg = van_default.state("");
	var progressText = van_default.state("");
	function createMatrix(ctx) {
		const { lang, browserLang } = ctx;
		const { div: vdiv, span: vspan, button: vbutton, b: vb, i: vi } = van_default.tags;
		const CAB = [
			["f", "F"],
			["j", "J"],
			["p", "P"],
			["y", "Y"]
		];
		function cabinLabel(c) {
			return c === "f" ? lang.first : c === "j" ? lang.business : c === "p" ? lang.premium : lang.economy;
		}
		function clearMatrix() {
			daysModel.val = [];
			openDates.val = new Set();
			progressText.val = "";
		}
		function sortedDays() {
			var arr = [...daysModel.val];
			var mode = sortMode.val;
			arr.sort(function(a, b) {
				if (mode === "seats") return (b.max || 0) - (a.max || 0) || Number(a.date) - Number(b.date);
				return Number(a.date) - Number(b.date);
			});
			return arr;
		}
		function dayVisible(d) {
			if (d.routes.some(function(r) {
				return r.error;
			})) return true;
			var ac = activeCabins.val, ns = nonstopOnly.val;
			if (ac.size === 4 && !ns) return true;
			if (!CAB.some(function(p) {
				return ac.has(p[0]) && d.best[p[0]] > 0;
			})) return false;
			if (ns) return CAB.some(function(p) {
				return ac.has(p[0]) && d.dir[p[0]];
			});
			return true;
		}
		function renderCell(d, c, L) {
			var n = d.best[c] || 0, dir = d.dir[c] ? 1 : 0;
			return vspan({
				class: "cell c" + L + " lvl" + seatLevel(n) + (dir ? " direct" : ""),
				"data-cabin": c
			}, vi({ class: "cl" }, cabinLabel(c)), vb(n > 0 ? String(n) : "—"), vi({
				class: "bar",
				style: "--w:" + Math.min(n, 9) / 9
			}));
		}
		function isDirectFlight(flight) {
			var seg = flight.segments;
			return seg.length === 1 && !(seg[0].technicalStops && seg[0].technicalStops[0]);
		}
		function routesHTML(d) {
			savedRev.val;
			var ac = activeCabins.val;
			var ns = nonstopOnly.val;
			var html = "";
			d.routes.forEach(function(r) {
				if (r.error) {
					html += `<div class="route_error"><strong>${browserLang == "zh" ? "錯誤：" : "Error: "}</strong>${r.error}</div>`;
					return;
				}
				if (!r.flights || !r.flights.length) return;
				var visible = r.flights.filter(function(f) {
					if (!CAB.some(function(p) {
						return ac.has(p[0]) && f.av[p[0]] > 0;
					})) return false;
					if (ns) return isDirectFlight(f.flight);
					return true;
				});
				if (!visible.length) return;
				html += `<div class="route_head"><span class="route_name">${r.from} → ${r.to}</span>
                <a href="javascript:void(0)" class="bulk_save${ctx.saved[d.date + r.from + r.to] ? " bulk_saved" : ""}" data-save="true" data-date="${d.date}" data-from="${r.from}" data-dest="${r.to}">${heart_svg}</a>
                <a href="javascript:void(0)" class="bulk_go_book" data-book="true" data-date="${d.date}" data-from="${r.from}" data-dest="${r.to}">${browserLang == "zh" ? "前往預訂 »" : "Book »"}</a></div>`;
				visible.forEach(function(f) {
					html += frowHTML(d.date, f.flight, f.av, ac);
				});
			});
			return html;
		}
		function renderDay(d) {
			var open = openDates.val.has(d.date);
			var empty = d.max === 0 && !d.routes.some(function(r) {
				return r.error;
			});
			return vdiv({
				class: "day" + (open ? " open" : "") + (empty ? " empty" : ""),
				"data-date": d.date,
				"data-max": d.max
			}, vbutton({
				class: "day_main",
				type: "button",
				"aria-expanded": open ? "true" : "false"
			}, vspan({ class: "day_date" }, vb(toDashedDate(d.date)), vi(dateWeekday(d.date))), vspan({ class: "day_cells" }, CAB.map(function(p) {
				return renderCell(d, p[0], p[1]);
			})), vspan({
				class: "day_chev",
				innerHTML: chevron_svg
			})), vdiv({
				class: "day_detail",
				hidden: !open
			}, vdiv({
				class: "flight_list",
				innerHTML: routesHTML(d)
			})));
		}
		function toggleDay(date) {
			var s = new Set(openDates.val);
			if (s.has(date)) s.delete(date);
			else s.add(date);
			openDates.val = s;
		}
		function frowHTML(date, flight, av, ac) {
			ac = ac || new Set([
				"f",
				"j",
				"p",
				"y"
			]);
			var seg = flight.segments, multi = seg.length > 1;
			var techStop = !multi && seg[0].technicalStops && seg[0].technicalStops[0];
			var direct = !multi && !techStop;
			var a1 = seg[0].flightIdentifier.marketingAirline, n1 = seg[0].flightIdentifier.flightNumber;
			var o1 = seg[0].originLocation, d1 = seg[0].destinationLocation;
			var dep1 = getFlightTime(seg[0].flightIdentifier.originDate).slice(11);
			var arr1 = getFlightTime(seg[0].destinationDate).slice(11);
			var dur = getFlightTime(flight.duration, true);
			var stop = multi ? d1.slice(-3) : techStop ? techStop.originLocation.slice(-3) : "";
			var key, num, sub;
			if (!multi) {
				key = date + o1.slice(-3) + d1.slice(-3) + "_" + a1 + n1 + (techStop ? "_" + stop : "");
				num = `${a1 + n1}${techStop ? `<span class="stopover">${stop}</span>` : ""}`;
				sub = `${o1.slice(-3)} → ${d1.slice(-3)} · ${dep1}–${arr1} · ${dur}${techStop ? " · " + stop + " tech" : multi ? "" : " · " + (browserLang == "zh" ? "直飛" : "Nonstop")}`;
			} else {
				var a2 = seg[1].flightIdentifier.marketingAirline, n2 = seg[1].flightIdentifier.flightNumber;
				var arr2 = getFlightTime(seg[1].destinationDate).slice(11);
				key = date + o1.slice(-3) + seg[1].destinationLocation.slice(-3) + "_" + a1 + n1 + "_" + stop + "_" + a2 + n2;
				num = `${a1 + n1}<span class="stopover">${stop}</span>${a2 + n2}`;
				sub = `${o1.slice(-3)} → ${stop} → ${seg[1].destinationLocation.slice(-3)} · ${dep1}–${arr2} · ${dur}`;
			}
			var badges = "";
			if (ac.has("f") && av.f > 0) badges += `<span class="bg bF">F${av.f}</span>`;
			if (ac.has("j") && av.j > 0) badges += `<span class="bg bJ">J${av.j}</span>`;
			if (ac.has("p") && av.p > 0) badges += `<span class="bg bP">PY${av.p}</span>`;
			if (ac.has("y") && av.y > 0) badges += `<span class="bg bY">Y${av.y}</span>`;
			if (ctx.savedFlights[key]) ctx.savedFlights[key] = {
				f: av.f,
				j: av.j,
				p: av.p,
				y: av.y
			};
			var destCode = (multi ? seg[1].destinationLocation : d1).slice(-3);
			var pickBtn = ctx.fromApp ? `<a href="javascript:void(0)" class="flight_pick" title="帶回規劃 App">${browserLang == "zh" ? "帶回" : "Use"} &raquo;</a>` : "";
			return `<div class="frow${direct ? " direct" : ""}${ctx.fromApp ? " has-pick" : ""}${ctx.savedFlights[key] ? " saved" : ""}" data-direct="${direct ? 1 : 0}" data-flightinfo="${key}" data-flightavail="${av.f}_${av.j}_${av.p}_${av.y}" data-carrier="${a1}" data-flightno="${n1}" data-from="${o1.slice(-3)}" data-to="${destCode}" data-date="${date}">
            <img class="fr_logo" src="https://book.cathaypacific.com${ctx.getStaticPath()}common/skin/img/airlines/logo-${a1.toLowerCase()}.png">
            <span class="fr_num">${num}</span>
            <span class="fr_badges">${badges}</span>
            <span class="fr_sub">${sub}</span>
            ${pickBtn}
            <a href="javascript:void(0)" class="flight_save">${heart_svg}</a>
        </div>`;
		}
		function merge(from, to, date, pageBom) {
			var days = [...daysModel.val];
			var d = days.find(function(x) {
				return x.date === date;
			});
			if (!d) {
				d = {
					date,
					best: {
						f: 0,
						j: 0,
						p: 0,
						y: 0
					},
					dir: {
						f: 0,
						j: 0,
						p: 0,
						y: 0
					},
					max: 0,
					routes: [],
					hasError: false
				};
				days.push(d);
			}
			if (pageBom.modelObject?.isContainingErrors) {
				d.routes.push({
					from,
					to,
					error: pageBom.modelObject?.messages?.[0]?.text || ""
				});
				d.hasError = true;
			} else {
				var upsell = pageBom.modelObject?.availabilities?.upsell;
				var flights = upsell?.bounds?.[0]?.flights || [];
				var rowFlights = [];
				flights.forEach(function(flight) {
					var av = availForFlight(upsell, flight);
					if (av.f + av.j + av.p + av.y === 0) return;
					var seg = flight.segments;
					var direct = seg.length === 1 && !(seg[0].technicalStops && seg[0].technicalStops[0]);
					CAB.forEach(function(p) {
						var c = p[0];
						if (av[c] > d.best[c]) d.best[c] = av[c];
						if (direct && av[c] > 0) d.dir[c] = 1;
					});
					rowFlights.push({
						flight,
						av
					});
				});
				if (rowFlights.length) d.routes.push({
					from,
					to,
					flights: rowFlights
				});
			}
			d.max = Math.max(d.best.f, d.best.j, d.best.p, d.best.y);
			daysModel.val = days;
			progressText.val = days.length + (browserLang == "zh" ? " 天" : "d");
			if (ctx.afterMerge) ctx.afterMerge();
		}
		function dayList() {
			return vdiv({ class: "day_list" }, sortedDays().filter(dayVisible).map(renderDay));
		}
		return {
			dayList,
			merge,
			clearMatrix,
			toggleDay
		};
	}
	function createSavedDrawer(ctx) {
		const { lang } = ctx;
		const { div: vdiv, span: vspan, label: vlabel, input: vinput, a: va } = van_default.tags;
		function pruneSaved(obj, key) {
			var pruned = false, now = new Date();
			Object.keys(obj).forEach(function(q) {
				if (new Date(+q.substring(0, 4), +q.substring(4, 6) - 1, +q.substring(6, 8)) <= now) {
					delete obj[q];
					pruned = true;
				}
			});
			if (pruned) ctx.valueSet(key, obj);
		}
		function savedQueriesArr() {
			return Object.keys(ctx.saved).map(function(q) {
				return {
					date: q.substring(0, 8),
					from: q.substring(8, 11).toUpperCase(),
					to: q.substring(11, 14).toUpperCase()
				};
			}).sort(function(a, b) {
				return a.date - b.date;
			});
		}
		function savedFlightsArr() {
			return Object.keys(ctx.savedFlights).map(function(q) {
				return {
					fullquery: q,
					date: q.substring(0, 8),
					from: q.substring(8, 11).toUpperCase(),
					to: q.substring(11, 14).toUpperCase(),
					leg1: q.split("_")[1] || "",
					stop: q.split("_")[2] || "",
					leg2: q.split("_")[3] || "",
					f: ctx.savedFlights[q].f,
					j: ctx.savedFlights[q].j,
					p: ctx.savedFlights[q].p,
					y: ctx.savedFlights[q].y
				};
			}).sort(function(a, b) {
				return a.date - b.date;
			});
		}
		function renderSavedQuery(q) {
			return vdiv({
				class: "saved_query",
				"data-date": q.date,
				"data-route": q.from + q.to
			}, vlabel(vinput({
				type: "checkbox",
				"data-route": q.date + q.from + q.to,
				"data-date": q.date
			}), " " + toDashedDate(q.date) + " " + q.from + "-" + q.to), va({
				href: "javascript:void(0);",
				class: "saved_book",
				"data-book": "true",
				"data-date": q.date,
				"data-from": q.from,
				"data-dest": q.to,
				innerHTML: lang.query + " &raquo;"
			}), vspan({ class: "leg" }), va({
				href: "javascript:void(0);",
				class: "saved_remove",
				"data-remove": q.date + q.from + q.to,
				innerHTML: trash_svg
			}));
		}
		function renderSavedFlight(q) {
			var avSpans = [];
			if (q.f > 0) avSpans.push(vspan({ class: "av_f" }, "F " + q.f));
			if (q.j > 0) avSpans.push(vspan({ class: "av_j" }, "J " + q.j));
			if (q.p > 0) avSpans.push(vspan({ class: "av_p" }, "PY " + q.p));
			if (q.y > 0) avSpans.push(vspan({ class: "av_y" }, "Y " + q.y));
			return vdiv({
				class: "saved_flight",
				"data-date": q.date,
				"data-route": q.from + q.to
			}, vlabel(vspan(vspan({ class: "sf_date" }, toDashedDate(q.date)), vspan({ class: "sf_route" }, q.from + "-" + (q.stop ? q.stop + "-" : "") + q.to), vspan({ class: "sf_flights" }, " " + q.leg1 + (q.leg2 ? " + " + q.leg2 : "") + " ", vspan({ class: "sf_avail" }, avSpans)))), vspan({ class: "leg" }), va({
				href: "javascript:void(0);",
				class: "saved_remove",
				"data-remove": q.fullquery,
				innerHTML: trash_svg
			}));
		}
		function mount(els) {
			van_default.derive(function() {
				savedRev.val;
				els.queries.replaceChildren(...savedQueriesArr().map(renderSavedQuery));
			});
			van_default.derive(function() {
				savedRev.val;
				els.flights.replaceChildren(...savedFlightsArr().map(renderSavedFlight));
			});
			van_default.derive(function() {
				savedRev.val;
				if (els.badge) els.badge.textContent = String(savedQueriesArr().length + savedFlightsArr().length);
			});
		}
		function updateCount() {
			pruneSaved(ctx.saved, "saved");
			savedRev.val = savedRev.val + 1;
		}
		function updateFlights() {
			pruneSaved(ctx.savedFlights, "saved_flights");
			savedRev.val = savedRev.val + 1;
		}
		return {
			mount,
			updateCount,
			updateFlights
		};
	}
	(function() {
		"use strict";
		const debug = false;
		const APP_VERSION = "v1.0.7";
		const advanced = true;
		function announceToApp() {
			try {
				if (typeof unsafeWindow !== "undefined") unsafeWindow.__CX_AWARD_VERSION__ = APP_VERSION;
				const hello = {
					source: "cx-award",
					type: "hello",
					version: APP_VERSION
				};
				window.addEventListener("message", function(e) {
					if (e.data && e.data.source === "cx-award" && e.data.type === "ping") window.postMessage(hello, "*");
				});
				[
					0,
					300,
					1200
				].forEach(function(t) {
					setTimeout(function() {
						window.postMessage(hello, "*");
					}, t);
				});
			} catch (e) {}
		}
		if (location.hostname.indexOf("cathaypacific.com") === -1) announceToApp();
		const _store = createGmStore(debug);
		function log(data) {
			_store.log(data);
		}
		function value_get(name, def) {
			return _store.get(name, def);
		}
		function value_set(name, val) {
			return _store.set(name, val);
		}
		function httpRequest(request, native = false) {
			if (!native && true) GM_xmlhttpRequest(request);
			else {
				if (!request.method || !request.url) return;
				var http = new XMLHttpRequest();
				http.withCredentials = true;
				http.open(request.method, request.url, true);
				if (request.headers) for (var key in request.headers) http.setRequestHeader(key, request.headers[key]);
				if (request.onreadystatechange) http.onreadystatechange = function() {
					request.onreadystatechange(this);
				};
				if (request.onload) http.onload = function() {
					request.onload(this);
				};
				if (request.data) http.send(request.data);
				else http.send();
			}
		}
		let route_changed = false;
		let static_path = value_get("static_path", "/CathayPacificAwardV3/AML_IT3.1.14/");
		let requestVars = {};
		let tab_id = "";
		let availability_url = "https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability?TAB_ID=";
		let form_submit_url = availability_url + tab_id;
		let autoScroll = true;
		function initCXvars() {
			if (typeof staticFilesPath !== "undefined" && static_path != staticFilesPath) {
				static_path = staticFilesPath;
				value_set("static_path", static_path);
			}
			if (typeof tabId === "string") tab_id = tabId;
			if (typeof requestParams === "string") {
				requestVars = JSON.parse(requestParams);
				tab_id = requestVars.TAB_ID;
			} else if (typeof requestParams === "object") {
				requestVars = requestParams;
				tab_id = requestParams.TAB_ID || "";
			}
			form_submit_url = typeof formSubmitUrl !== "undefined" ? formSubmitUrl : availability_url + tab_id;
		}
		const browser_locale = navigator.language;
		const browser_lang = browser_locale.trim().split(/-|_/)[0] == "zh" ? "zh" : "en";
		const browser_country = browser_locale.trim().split(/-|_/)[1]?.toUpperCase() == "TW" ? "TW" : "HK";
		let login_url = "https://www.cathaypacific.com/cx/" + browser_lang + "_" + browser_country + "/sign-in.html?loginreferrer=" + encodeURI("https://www.cathaypacific.com/cx/" + browser_lang + "_" + browser_country + "/book-a-trip/redeem-flights/redeem-flight-awards.html");
		function waitForElm(selector) {
			return new Promise((resolve) => {
				if (document.querySelector(selector)) return resolve(document.querySelector(selector));
				const observer = new MutationObserver((mutations) => {
					if (document.querySelector(selector)) {
						resolve(document.querySelector(selector));
						observer.disconnect();
					}
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
			});
		}
		function addCss(cssString, target) {
			var styleSheet = document.createElement("style");
			styleSheet.innerHTML = cssString;
			(target || shadowRoot).appendChild(styleSheet);
		}
		let uef_from = value_get("uef_from", "TPE");
		let uef_to = value_get("uef_to", "TYO");
		let uef_date = value_get("uef_date", dateAdd(14));
		let uef_adult = value_get("uef_adult", "1");
		let uef_child = value_get("uef_child", "0");
		let saved = value_get("saved", {});
		let saved_flights = value_get("saved_flights", {});
		const _availCache = createAvailCache(_store, 1800 * 1e3);
		let last_sig = value_get("last_sig", "");
		let cont_query = value_get("cont_query", "0") == "0" ? 0 : 1;
		let cont_batch = value_get("cont_batch", "0") == "0" ? 0 : 1;
		let cont_saved = value_get("cont_saved", "0") == "0" ? 0 : 1;
		let cont_ts = value_get("cont_ts", "0");
		let redirect_search = value_get("redirect_search", "0");
		function reset_cont_vars() {
			if (redirect_search != "0") value_set("redirect_search", "0");
			else {
				value_set("cont_query", "0");
				value_set("cont_batch", "0");
				value_set("cont_saved", "0");
				value_set("cont_ts", "0");
			}
		}
		const shadowWrapper = document.createElement("div");
		shadowWrapper.style.margin = 0;
		shadowWrapper.style.padding = 0;
		const shadowRoot = shadowWrapper.attachShadow({ mode: "closed" });
		const shadowContainer = document.createElement("div");
		shadowContainer.classList.add("cx_container", "elevated_on");
		shadowRoot.appendChild(shadowContainer);
		function initRoot() {
			log("initRoot();");
			addCss(styleCss);
			const current_page = window.location.href;
			if (current_page.indexOf("/redibe/IBEFacade") > -1) waitForElm("h1").then((elm) => {
				if (elm.innerText == "Access Denied") document.body.querySelector("body > p").innerHTML = `<a href="https://www.cathaypacific.com/cx/${lang.el}_${lang.ec}/book-a-trip/redeem-flights/redeem-flight-awards.html">Go back and try again.</a>`;
			});
			else if (current_page.indexOf("redeem-flight-awards.html") > -1) {
				reset_cont_vars();
				waitForElm(".redibe-v3-flightsearch form").then((elm) => {
					elm.before(shadowWrapper);
					initSearchBox();
					if (redirect_search != "0") {
						btn_search.innerHTML = lang.searching;
						btn_search.classList.add("searching");
						setTimeout(function() {
							location.href = redirect_search;
						}, 1500);
					} else runCxBridge();
				});
			} else if (current_page.indexOf("facade.html") > -1) {
				reset_cont_vars();
				waitForElm(".ibered__search-panel").then((elm) => {
					elm.before(shadowWrapper);
					initSearchBox();
				});
			} else if (current_page.indexOf("air/booking/availability") > -1 && cont_query) waitForElm("body > header").then((elm) => {
				document.querySelectorAll("body > div").forEach((box) => {
					box.remove();
				});
				addCss(`html, body {overflow-x:inherit !important;} header {overflow-x:hidden;}`, document.body);
				document.body.append(shadowWrapper);
				shadowContainer.classList.add("results_container");
				initSearchBox();
			});
			else if (window.location.href.indexOf("air/booking/availability") > -1) {
				reset_cont_vars();
				waitForElm("#section-flights .bound-route, #section-flights-departure .bound-route").then((elm) => {
					shadowWrapper.style.margin = "30px 20px 0px 20px";
					shadowWrapper.style.padding = 0;
					document.querySelector("#section-flights, #section-flights-departure").before(shadowWrapper);
					initSearchBox();
				});
			} else if (window.location.href.indexOf("air/booking/complexAvailability") > -1) {
				reset_cont_vars();
				waitForElm(".mc-trips .bound-route").then((elm) => {
					shadowWrapper.style.margin = "30px 20px 0px 20px";
					shadowWrapper.style.padding = 0;
					document.querySelector(".mc-trips").before(shadowWrapper);
					initSearchBox();
				});
			}
		}
		var lang = buildLang(browser_lang);
		const searchBox = document.createElement("div");
		searchBox.innerHTML = buildSearchBoxHTML({
			lang,
			browserLang: browser_lang,
			version: APP_VERSION,
			vals: {
				from: uef_from,
				to: uef_to,
				date: uef_date,
				adult: uef_adult,
				child: uef_child
			}
		});
		const styleCss = buildStyleCss({
			jade: "#2F4BFF",
			jadeDark: "#243CCF",
			amber: "#2F4BFF",
			amberDark: "#7E8AAE",
			ink: "#E7EBF1",
			ink2: "#9BA4AF",
			ink3: "#6B747E",
			surface: "#12161B",
			panel: "#1A1F26",
			subtle: "#222932",
			border: "#2A313B",
			borderStrong: "#384150",
			fBg: "#3A2F12",
			fTx: "#E2BE64",
			jBg: "#10302A",
			jTx: "#3BB39C",
			pBg: "#241D3A",
			pTx: "#B39CFF",
			yBg: "#15263A",
			yTx: "#5AA9E6",
			errBg: "#3A1D1D",
			errTx: "#EC7468"
		}, lang);
		let btn_search, btn_batch;
		let input_from, input_to, input_date, input_adult, input_child;
		let clear_from, clear_to;
		let link_search_saved, link_search_multi, div_filters;
		let div_bulk_box, div_footer, div_ue_container, div_saved, div_faves_tabs, div_saved_queries;
		let div_saved_flights, div_multi_box, div_table, div_progress, sort_by;
		function assignElemets() {
			log("assignElemets()");
			btn_search = shadowRoot.querySelector(".uef_search");
			btn_batch = shadowRoot.querySelector(".bulk_submit");
			input_from = shadowRoot.querySelector("#uef_from");
			input_to = shadowRoot.querySelector("#uef_to");
			input_date = shadowRoot.querySelector("#uef_date");
			input_adult = shadowRoot.querySelector("#uef_adult");
			input_child = shadowRoot.querySelector("#uef_child");
			clear_from = shadowRoot.querySelector(".clear_from");
			clear_to = shadowRoot.querySelector(".clear_to");
			link_search_saved = shadowRoot.querySelector(".search_selected");
			link_search_multi = shadowRoot.querySelector(".multi_search");
			div_filters = shadowRoot.querySelector(".filters");
			div_bulk_box = shadowRoot.querySelector(".bulk_box");
			div_footer = shadowRoot.querySelector(".bulk_footer");
			div_ue_container = shadowRoot.querySelector(".cx_form");
			div_saved = shadowRoot.querySelector(".cx_faves");
			div_faves_tabs = shadowRoot.querySelector(".cx_faves .faves_tabs");
			div_saved_queries = shadowRoot.querySelector(".cx_faves .saved_queries");
			div_saved_flights = shadowRoot.querySelector(".cx_faves .saved_flights");
			div_multi_box = shadowRoot.querySelector(".multi_box");
			div_table = shadowRoot.querySelector(".matrix");
			div_progress = shadowRoot.querySelector(".progress");
			sort_by = shadowRoot.querySelector("#sort_by");
			var staticList = shadowRoot.querySelector(".day_list");
			if (staticList) staticList.remove();
			van_default.add(div_table, matrix.dayList);
			van_default.derive(function() {
				var ac = activeCabins.val;
				div_table.classList.toggle("show_first", ac.has("f"));
				div_table.classList.toggle("show_business", ac.has("j"));
				div_table.classList.toggle("show_premium", ac.has("p"));
				div_table.classList.toggle("show_economy", ac.has("y"));
				div_table.classList.toggle("nonstop_only", nonstopOnly.val);
			});
		}
		function dateVal() {
			return (input_date.value || "").replace(/-/g, "");
		}
		function addFormListeners() {
			log("addFormListeners()");
			btn_search.addEventListener("click", function(e) {
				uef_from = value_set("uef_from", input_from.value);
				uef_to = value_set("uef_to", input_to.value);
				uef_date = value_set("uef_date", dateVal());
				uef_adult = value_set("uef_adult", input_adult.value);
				uef_child = value_set("uef_child", input_child.value);
				regularSearch([{
					from: uef_from.substring(0, 3),
					to: uef_to.substring(0, 3),
					date: uef_date
				}], {
					adult: uef_adult,
					child: uef_child
				}, "Y", uef_to.length > 3 ? true : false, false);
			});
			btn_batch.addEventListener("click", function(e) {
				autoScroll = true;
				bulk_click();
			});
			shadowRoot.querySelector(".switch").addEventListener("click", function(e) {
				let from = input_from.value;
				let to = input_to.value;
				input_from.value = to;
				input_to.value = from;
				route_changed = searchSig() !== last_sig;
			});
			[input_from, input_to].forEach((item) => {
				item.addEventListener("keyup", function(e) {
					if (e.keyCode == 32 || e.keyCode == 188 || e.keyCode == 13) {
						if (e.keyCode == 13) this.value += ",";
						this.value = this.value.toUpperCase().split(/[ ,]+/).join(",");
					}
				});
			});
			input_from.addEventListener("change", function(e) {
				route_changed = searchSig() !== last_sig;
				batchLabel(lang.bulk_batch + " " + input_from.value + " - " + input_to.value + " " + lang.bulk_flights);
				let dest = this.value.match(/[A-Z]{3}$/);
				if (dest) getDestinations(dest[0]);
			});
			input_to.addEventListener("change", function(e) {
				route_changed = searchSig() !== last_sig;
				batchLabel(lang.bulk_batch + " " + input_from.value + " - " + input_to.value + " " + lang.bulk_flights);
			});
			let inFocus = false;
			[input_from, input_to].forEach((item) => {
				item.addEventListener("focus", function(e) {
					if (this.value.length > 0 && advanced) this.value = this.value + ",";
				});
			});
			[input_from, input_to].forEach((item) => {
				item.addEventListener("click", function(e) {
					if (!inFocus) this.setSelectionRange(this.value.length, this.value.length);
					inFocus = true;
				});
			});
			[input_from, input_to].forEach((item) => {
				item.addEventListener("blur", function(e) {
					inFocus = false;
					this.value = this.value.toUpperCase().split(/[ ,]+/).join(",").replace(/,+$/, "");
					this.dispatchEvent(new Event("change"));
					checkCities(this);
				});
			});
			input_date.addEventListener("change", function(e) {
				if (!isValidDate(dateVal())) {
					alert(lang.invalid_date);
					this.value = toDashedDate(uef_date);
				} else route_changed = searchSig() !== last_sig;
			});
			clear_from.addEventListener("click", function(e) {
				input_from.value = "";
			});
			clear_to.addEventListener("click", function(e) {
				input_to.value = "";
			});
			div_table.addEventListener("click", function(e) {
				var t = e.target;
				var dayMain = t.closest ? t.closest(".day_main") : null;
				if (dayMain) {
					var dayEl = dayMain.parentNode;
					if (dayEl && dayEl.dataset.date) toggleDay(dayEl.dataset.date);
					return;
				}
				var pick = t.closest ? t.closest(".flight_pick") : null;
				if (pick) {
					var frp = pick.closest(".frow");
					if (!frp || !window.opener) return;
					var pa = (frp.dataset.flightavail || "0_0_0_0").split("_");
					window.opener.postMessage({
						source: "cx-award",
						type: "flight",
						leg: {
							from: frp.dataset.from,
							to: frp.dataset.to,
							date: frp.dataset.date || ""
						},
						flight: {
							carrier: frp.dataset.carrier,
							flightNo: frp.dataset.flightno,
							seats: {
								f: +pa[0] || 0,
								j: +pa[1] || 0,
								p: +pa[2] || 0,
								y: +pa[3] || 0
							}
						}
					}, "*");
					var orig = pick.innerHTML;
					pick.innerHTML = browser_lang == "zh" ? "已帶回 ✓" : "Sent ✓";
					pick.classList.add("picked");
					setTimeout(function() {
						pick.innerHTML = orig;
						pick.classList.remove("picked");
					}, 1600);
					return;
				}
				var fs = t.closest ? t.closest(".flight_save") : null;
				if (fs) {
					var fr = fs.closest(".frow");
					if (!fr) return;
					var fkey = fr.dataset.flightinfo;
					var fa = fr.dataset.flightavail.split("_");
					if (saved_flights[fkey]) delete saved_flights[fkey];
					else saved_flights[fkey] = {
						f: fa[0],
						j: fa[1],
						p: fa[2],
						y: fa[3]
					};
					value_set("saved_flights", saved_flights);
					update_saved_flights();
					return;
				}
				var bookEl = t.closest ? t.closest("[data-book]") : null;
				if (bookEl) {
					stop_batch();
					bookEl.innerText = lang.loading;
					regularSearch([{
						from: bookEl.dataset.from || uef_from.substring(0, 3),
						to: bookEl.dataset.dest || uef_to.substring(0, 3),
						date: bookEl.dataset.date
					}], {
						adult: uef_adult,
						child: uef_child
					}, "Y", false, false, false);
					return;
				}
				var saveEl = t.closest ? t.closest("[data-save]") : null;
				if (saveEl) {
					var skey = saveEl.dataset.date + saveEl.dataset.from + saveEl.dataset.dest;
					if (saved[skey]) delete saved[skey];
					else saved[skey] = 1;
					value_set("saved", saved);
					update_saved_count();
				}
			});
			document.addEventListener("scroll", function() {
				shadowRoot.querySelectorAll(".flight_item").forEach(function(elm) {
					elm.classList.remove("active");
				});
			});
			div_saved.addEventListener("click", function(e) {
				if (e.target.dataset.remove) {
					delete saved[e.target.dataset.remove];
					delete saved_flights[e.target.dataset.remove];
					update_saved_count();
					update_saved_flights();
					value_set("saved", saved);
					value_set("saved_flights", saved_flights);
				}
			});
			div_saved_queries.addEventListener("click", function(e) {
				if (e.target.dataset.book) {
					stop_batch();
					e.target.innerText = lang.loading;
					regularSearch([{
						from: e.target.dataset.from ? e.target.dataset.from : uef_from,
						to: e.target.dataset.dest ? e.target.dataset.dest : uef_to,
						date: e.target.dataset.date
					}], {
						adult: 1,
						child: 0
					});
				} else if (e.target.type == "checkbox") {
					div_saved_queries.querySelectorAll(".selected").forEach(function(elm) {
						delete elm.dataset.new;
					});
					if (e.target.checked) {
						e.target.parentNode.parentNode.dataset.new = true;
						e.target.parentNode.parentNode.classList.add("selected");
						div_saved_queries.parentNode.classList.add("multi_on");
						div_multi_box.classList.remove("hidden");
					} else {
						e.target.parentNode.parentNode.classList.remove("selected");
						e.target.parentNode.parentNode.querySelector(".leg").innerText = "";
						delete e.target.parentNode.parentNode.dataset.segment;
						if (div_saved_queries.querySelectorAll(".selected").length == 0) {
							div_saved_queries.parentNode.classList.remove("multi_on");
							div_multi_box.classList.add("hidden");
						}
					}
					let segments_array = div_saved_queries.querySelectorAll(".selected");
					if (segments_array.length == 6) div_saved_queries.querySelectorAll("input:not(:checked)").forEach((item) => {
						item.disabled = true;
					});
					else div_saved_queries.querySelectorAll("input").forEach((item) => {
						item.disabled = false;
					});
					let pos = 1;
					Array.from(segments_array).sort(function(a, b) {
						if (+a.dataset.date > +b.dataset.date) return 1;
						if (a.dataset.date == b.dataset.date) return a.dataset.new ? 1 : a.dataset.segment > b.dataset.segment ? 1 : -1;
						return false;
					}).forEach(function(elm) {
						elm.dataset.segment = pos;
						elm.querySelector(".leg").innerText = "Segment " + pos;
						pos++;
					});
				}
			});
			var cabinFilterMap = {
				filter_first: "f",
				filter_business: "j",
				filter_premium: "p",
				filter_economy: "y"
			};
			div_filters.querySelectorAll("input").forEach((item) => {
				item.addEventListener("change", function() {
					if (this.id === "filter_nonstop") {
						nonstopOnly.val = this.checked;
						return;
					}
					var c = cabinFilterMap[this.id];
					if (!c) return;
					var s = new Set(activeCabins.val);
					if (this.checked) s.add(c);
					else s.delete(c);
					activeCabins.val = s;
				});
			});
			link_search_saved.addEventListener("click", function(e) {
				if (Object.keys(saved).length == 0) alert("尚無收藏行程。");
				else {
					this.innerText = lang.loading;
					saved_search();
				}
			});
			link_search_multi.addEventListener("click", function(e) {
				if (shadowRoot.querySelectorAll(".saved_query.selected").length == 0) alert("尚未選擇任何航段。");
				else {
					this.innerText = lang.loading;
					var to_search = [];
					Array.from(shadowRoot.querySelectorAll(".saved_query.selected")).sort(function(a, b) {
						return a.dataset.segment - b.dataset.segment;
					}).forEach((segment) => {
						to_search.push({
							date: segment.dataset.date,
							from: segment.dataset.route.substring(0, 3),
							to: segment.dataset.route.substring(3, 6)
						});
					});
					regularSearch(to_search, {
						adult: shadowRoot.querySelector("#multi_adult").value,
						child: shadowRoot.querySelector("#multi_child").value
					}, shadowRoot.querySelector("#multi_cabin").value);
				}
			});
			if (sort_by) sort_by.addEventListener("change", function() {
				sortMode.val = this.value;
			});
			var clearCacheBtn = shadowRoot.querySelector(".clear_cache");
			if (clearCacheBtn) clearCacheBtn.addEventListener("click", function() {
				if (searching) stop_batch();
				_availCache.clear();
				clearMatrix();
				last_sig = value_set("last_sig", "");
				route_changed = true;
				batchError(false);
			});
			div_faves_tabs.addEventListener("click", function(e) {
				if (e.target.classList.contains("tab_flights")) this.parentNode.classList.add("flights");
				if (e.target.classList.contains("tab_queries")) this.parentNode.classList.remove("flights");
			});
			shadowRoot.querySelector(".cx_saved a").addEventListener("click", function(e) {
				shadowRoot.querySelector(".cx_faves").classList.toggle("cx_faves_hidden");
			});
		}
		const airports = {
			origins: [],
			dest: []
		};
		function getOrigins() {
			log("getOrigins()");
			httpRequest({
				method: "GET",
				url: "https://api.cathaypacific.com/redibe/airport/origin/" + (browser_lang == "zh" ? browser_country == "CN" ? "sc" : "zh" : "en") + "/",
				onload: function(response) {
					var data = JSON.parse(response.responseText);
					if (data.airports) data.airports.forEach((airport) => {
						airports.origins[airport.airportCode] = {
							airportCode: airport.airportCode,
							shortName: airport.shortName,
							countryName: airport.countryName
						};
					});
					else airports.origins = [];
				}
			});
		}
		function getDestinations(from) {
			if (!airports.origins[from]) return;
			log("getDestinations()");
			httpRequest({
				method: "GET",
				url: "https://api.cathaypacific.com/redibe/airport/destination/" + from + "/" + (browser_lang == "zh" ? browser_country == "CN" ? "sc" : "zh" : "en") + "/",
				onload: function(response) {
					var data = JSON.parse(response.responseText);
					if (data.airports) data.airports.forEach((airport) => {
						airports.dest[airport.airportCode] = {
							airportCode: airport.airportCode,
							shortName: airport.shortName,
							countryName: airport.countryName
						};
					});
					else airports.dest = [];
				}
			});
		}
		function batchLabel(label) {
			if (shadowRoot.querySelector(".bulk_submit")) shadowRoot.querySelector(".bulk_submit").innerHTML = label;
		}
		function batchError(label) {
			errorMsg.val = label ? String(label) : "";
		}
		function autocomplete(inp, list) {
			var currentFocus;
			inp.addEventListener("input", function(e) {
				newAC(this, e);
			});
			inp.addEventListener("keydown", function(e) {
				var x = shadowRoot.getElementById(this.id + "autocomplete-list");
				if (x) x = x.getElementsByTagName("div");
				if (e.keyCode == 40) {
					currentFocus++;
					addActive(x);
				} else if (e.keyCode == 38) {
					currentFocus--;
					addActive(x);
				} else if (e.keyCode == 13) {
					e.preventDefault();
					if (currentFocus > -1) {
						if (x && x[currentFocus]) x[currentFocus].click();
					} else if (x && x[0]) x[0].click();
					closeAllLists();
				} else if (e.keyCode == 32 || e.keyCode == 9) {
					if (x && x[0]) x[0].click();
					closeAllLists();
				}
			});
			function addActive(x) {
				if (!x) return false;
				removeActive(x);
				if (currentFocus >= x.length) currentFocus = 0;
				if (currentFocus < 0) currentFocus = x.length - 1;
				x[currentFocus].classList.add("autocomplete-active");
			}
			function removeActive(x) {
				for (var i = 0; i < x.length; i++) x[i].classList.remove("autocomplete-active");
			}
			function closeAllLists(elmnt) {
				var x = shadowRoot.querySelectorAll(".autocomplete-items");
				for (var i = 0; i < x.length; i++) if (elmnt != x[i] && elmnt != inp) x[i].parentNode.removeChild(x[i]);
			}
			function checkLocale(code) {
				return code.replace(atob("VGFpd2FuIENoaW5h"), atob("VGFpd2Fu")).replace(decodeURI(atob("JUU0JUI4JUFEJUU1JTlDJThCJUU1JThGJUIwJUU3JTgxJUEz")), decodeURI("%E5%8F%B0%E7%81%A3"));
			}
			function newAC(elm, e) {
				var arr = airports[list] || [];
				var a, b, c, sa, sc, se, val = elm.value;
				closeAllLists();
				val = elm.value.match(/[^,]+$/) ? elm.value.match(/[^,]+$/)[0] : false;
				if (!val) return false;
				currentFocus = -1;
				a = document.createElement("DIV");
				a.setAttribute("id", elm.id + "autocomplete-list");
				a.setAttribute("class", "autocomplete-items");
				elm.parentNode.appendChild(a);
				var sep = document.createElement("span");
				sep.style.display = "none";
				sep.classList.add("ac_separator");
				a.appendChild(sep);
				var favs = [
					"TPE",
					"TSA",
					"KHH",
					"RMQ",
					"TYO",
					"HND",
					"NRT",
					"KIX",
					"ITM",
					"CTS",
					"FUK",
					"NGO",
					"OKA",
					"ICN",
					"PUS",
					"GMP",
					"CJU",
					"HKG",
					"MFM",
					"BKK",
					"CNX",
					"HKT",
					"CGK",
					"DPS",
					"SUB",
					"KUL",
					"BKI",
					"PEN",
					"DAD",
					"HAN",
					"SGN",
					"CEB",
					"MNL",
					"SIN",
					"PNH",
					"DEL",
					"BOM",
					"DXB",
					"DOH",
					"TLV",
					"BCN",
					"MAD",
					"MXP",
					"CDG",
					"ZRH",
					"MUC",
					"FCO",
					"FRA",
					"AMS",
					"LHR",
					"LGW",
					"LON",
					"MAN",
					"BOS",
					"JFK",
					"YYZ",
					"ORD",
					"IAD",
					"YVR",
					"SFO",
					"LAX",
					"SAN",
					"SEA",
					"JNB",
					"PER",
					"SYD",
					"BNE",
					"MEL",
					"AKL",
					"HEL",
					"BLR",
					"SHA",
					"PVG",
					"PEK",
					"CAN",
					"KTM",
					"ADL",
					"CPT",
					"ATH",
					"IST",
					"SOF",
					"VCE",
					"BUD",
					"PRG",
					"VIE",
					"BER",
					"WAW",
					"KBP",
					"CPH",
					"DUS",
					"BRU",
					"OSL",
					"ARN",
					"DUB",
					"MIA",
					"ATL",
					"IAH",
					"DFW",
					"PHL",
					"CMN",
					"LAS",
					"SJC",
					"DEN",
					"AUS",
					"MSY",
					"MCO",
					"EWR",
					"NYC",
					"LIS",
					"OPO",
					"SPU",
					"DBV",
					"ZAG",
					"MLE",
					"LIM",
					"BOG",
					"CNS",
					"GRU",
					"SCL",
					"GIG",
					"EZE",
					"MEX",
					"CUN"
				];
				Object.keys(arr).forEach((key) => {
					var airportCode = arr[key].airportCode;
					var countryName = checkLocale(arr[key].countryName);
					var shortName = arr[key].shortName;
					if (airportCode.length > 3) return;
					if (val.toUpperCase() == airportCode.substr(0, val.length).toUpperCase() || val.toUpperCase() == countryName.substr(0, val.length).toUpperCase() || val.toUpperCase() == shortName.substr(0, val.length).toUpperCase()) {
						sa = airportCode.substr(0, val.length).toUpperCase() == val.toUpperCase() ? val.length : 0;
						se = shortName.substr(0, val.length).toUpperCase() == val.toUpperCase() ? val.length : 0;
						sc = countryName.substr(0, val.length).toUpperCase() == val.toUpperCase() ? val.length : 0;
						b = document.createElement("DIV");
						c = "<span class='sa_code'><strong>" + airportCode.substr(0, sa) + "</strong>" + airportCode.substr(sa) + "</span>";
						c += "<span class='sc_code'><strong>" + shortName.substr(0, se) + "</strong>" + shortName.substr(se);
						c += " - <strong>" + countryName.substr(0, sc) + "</strong>" + countryName.substr(sc) + "</span>";
						c += "</span>";
						c += "<input type='hidden' value='" + airportCode + "'>";
						b.dataset.city = airportCode;
						b.innerHTML = c;
						b.addEventListener("click", function(e) {
							inp.value = [inp.value.replace(/([,]?[^,]*)$/, ""), this.dataset.city].filter(Boolean).join(",");
							inp.dispatchEvent(new Event("change"));
							closeAllLists();
						});
						if ([
							"TPE",
							"KHH",
							"HKG"
						].includes(airportCode)) a.prepend(b);
						else if (favs.includes(airportCode)) a.insertBefore(b, sep);
						else a.appendChild(b);
					}
				});
			}
			document.addEventListener("click", function(e) {
				if (e.target == inp) return;
				closeAllLists(e.target);
			});
		}
		function elevate() {
			log("elevate()");
			input_from.setAttribute("placeholder", "TPE,HKG");
			input_to.setAttribute("placeholder", "TYO,LHR,SFO");
		}
		let searching = false;
		let abortCtl = null;
		var bulk_date = "";
		function resetSearch() {
			searching = false;
			if (abortCtl) abortCtl.abort();
			batchLabel(lang.search_20);
			shadowRoot.querySelector(".bulk_submit").classList.remove("bulk_searching");
		}
		function stop_batch() {
			log("Batch Clicked. Stopping Search.");
			searching = false;
			if (abortCtl) abortCtl.abort();
			shadowRoot.querySelector(".bulk_submit").innerText = lang.next_batch;
			shadowRoot.querySelector(".bulk_submit").classList.remove("bulk_searching");
			batchError(false);
		}
		function startBatch(work) {
			searching = true;
			abortCtl = new AbortController();
			const signal = abortCtl.signal;
			Promise.resolve().then(() => work(signal)).catch((e) => {
				if (e instanceof HttpAbortError) return;
				log(e);
				batchError(String(e && e.message || e));
			}).finally(() => {
				searching = false;
			});
		}
		function bulk_click(single_date = false) {
			shadowRoot.querySelector(".bulk_results").classList.remove("bulk_results_hidden");
			if (searching) {
				stop_batch();
				return;
			}
			log("Batch Clicked. Starting Search.");
			uef_from = value_set("uef_from", input_from.value);
			uef_to = value_set("uef_to", input_to.value);
			uef_date = value_set("uef_date", dateVal());
			uef_adult = value_set("uef_adult", input_adult.value);
			uef_child = value_set("uef_child", input_child.value);
			btn_batch.innerHTML = lang.searching_w_cancel;
			btn_batch.classList.add("bulk_searching");
			last_sig = value_set("last_sig", searchSig());
			startBatch((signal) => runBatch(single_date, signal));
		}
		function saved_search() {
			if (searching) {
				stop_batch();
				return;
			}
			btn_batch.innerHTML = lang.searching_w_cancel;
			btn_batch.classList.add("bulk_searching");
			startBatch((signal) => runSavedSearch(signal));
		}
		async function runSavedSearch(signal) {
			var to_search = [];
			Object.keys(saved).forEach((query) => {
				to_search.push({
					date: query.substring(0, 8),
					from: query.substring(8, 11),
					to: query.substring(11, 14)
				});
			});
			to_search.sort(function(a, b) {
				return a.date - b.date;
			});
			shadowRoot.querySelector(".bulk_results").classList.remove("bulk_results_hidden");
			clearMatrix();
			if (!cont_query && window.location.href.indexOf("air/booking/availability") > -1) {
				document.querySelectorAll("body > div").forEach((box) => {
					box.remove();
				});
				addCss(`html, body {overflow-x:inherit !important;} header {overflow-x:hidden;}`, document.body);
				document.body.append(shadowWrapper);
				shadowContainer.classList.add("results_container");
				document.body.classList.add("cont_query");
			} else if (!cont_query) {
				var first = to_search[0];
				if (first) regularSearch([{
					from: first.from,
					to: first.to,
					date: first.date
				}], {
					adult: 1,
					child: 0
				}, "Y", true, false, true);
				return;
			}
			for (var i = 0; i < to_search.length; i++) {
				if (signal.aborted) return;
				var q = to_search[i];
				var bom = await searchAvailability(q.from, q.to, q.date, 1, 0, signal);
				if (signal.aborted) return;
				if (bom) insertResults(q.from, q.to, q.date, bom);
			}
			link_search_saved.innerText = lang.search_selected;
			stop_batch();
			route_changed = true;
		}
		const drawer = createSavedDrawer({
			lang,
			saved,
			savedFlights: saved_flights,
			valueSet: value_set
		});
		function mountSavedLists() {
			drawer.mount({
				queries: div_saved_queries,
				flights: div_saved_flights,
				badge: shadowRoot.querySelector(".cx_saved a span")
			});
		}
		function mountStatus() {
			var errBox = shadowRoot.querySelector(".bulk_error");
			var errSpan = shadowRoot.querySelector(".bulk_error span");
			van_default.derive(function() {
				var m = errorMsg.val;
				if (errSpan) errSpan.innerHTML = m;
				if (errBox) errBox.classList.toggle("bulk_error_hidden", !m);
			});
			van_default.derive(function() {
				var t = progressText.val;
				if (div_progress) {
					div_progress.textContent = t;
					div_progress.hidden = !t;
				}
			});
		}
		function update_saved_count() {
			drawer.updateCount();
		}
		function update_saved_flights() {
			drawer.updateFlights();
		}
		function checkCities(elem) {
			log("checkCities()");
			setTimeout(function() {
				var cities = elem.value.split(",");
				var errorcities = [];
				cities = cities.filter((city) => {
					if (city.match(/^[A-Z]{3}$/)) return true;
					else {
						errorcities.push(city);
						return false;
					}
				});
				if (errorcities.filter(Boolean).length > 0) {
					elem.value = cities.join(",");
					elem.dispatchEvent(new Event("change"));
					alert("已移除無效機場代碼：" + errorcities.filter(Boolean).join(","));
				}
			}, 500);
		}
		function newQueryPayload(route = {
			from: "HND",
			to: "ITM",
			date: dateAdd(14)
		}, passengers = {
			adult: 1,
			child: 0
		}, cabinclass = "Y", oneway = false, flexible = "false") {
			log("newQueryPayload()");
			const target = new URL("https://api.cathaypacific.com/redibe/IBEFacade");
			const params = new URLSearchParams();
			params.set("ACTION", "RED_AWARD_SEARCH");
			params.set("ENTRYPOINT", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/book-a-trip/redeem-flights/redeem-flight-awards.html");
			params.set("ENTRYLANGUAGE", lang.el);
			params.set("ENTRYCOUNTRY", lang.ec);
			params.set("RETURNURL", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/book-a-trip/redeem-flights/redeem-flight-awards.html?recent_search=ow");
			params.set("ERRORURL", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/book-a-trip/redeem-flights/redeem-flight-awards.html?recent_search=ow");
			params.set("CABINCLASS", cabinclass);
			params.set("BRAND", "CX");
			params.set("ADULT", passengers.adult || 1);
			params.set("CHILD", passengers.child || 0);
			params.set("FLEXIBLEDATE", flexible);
			params.set("ORIGIN[1]", route.from);
			params.set("DESTINATION[1]", route.to);
			params.set("DEPARTUREDATE[1]", route.date);
			params.set("LOGINURL", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/sign-in.html?loginreferrer=https%3A%2F%2Fwww.cathaypacific.com%2Fcx%2F" + lang.el + "_" + lang.ec + "%2Fbook-a-trip%2Fredeem-flights%2Fredeem-flight-awards.html%3Fauto_submit%3Dtrue%26recent_search%3Dow%26vs%3D2");
			target.search = params.toString();
			return target;
		}
		function newMultiPayload(routes, passengers, cabinclass = "Y") {
			log("newMultiPayload()");
			const target = new URL("https://api.cathaypacific.com/redibe/IBEFacade");
			const params = new URLSearchParams();
			params.set("ACTION", "RED_AWARD_SEARCH");
			params.set("ENTRYPOINT", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/book-a-trip/redeem-flights/redeem-flight-awards.html");
			params.set("ENTRYLANGUAGE", lang.el);
			params.set("ENTRYCOUNTRY", lang.ec);
			params.set("RETURNURL", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/book-a-trip/redeem-flights/redeem-flight-awards.html?recent_search=mc");
			params.set("ERRORURL", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/book-a-trip/redeem-flights/redeem-flight-awards.html?recent_search=mc");
			params.set("CABINCLASS", cabinclass);
			params.set("BRAND", "CX");
			params.set("ADULT", passengers.adult || 1);
			params.set("CHILD", passengers.child || 0);
			params.set("FLEXIBLEDATE", "false");
			for (var i = 0; i < routes.length; i++) {
				params.set("ORIGIN[" + (i + 1) + "]", routes[i].from);
				params.set("DESTINATION[" + (i + 1) + "]", routes[i].to);
				params.set("DEPARTUREDATE[" + (i + 1) + "]", routes[i].date);
			}
			params.set("LOGINURL", "https://www.cathaypacific.com/cx/" + lang.el + "_" + lang.ec + "/sign-in.html?loginreferrer=https%3A%2F%2Fwww.cathaypacific.com%2Fcx%2F" + lang.el + "_" + lang.ec + "%2Fbook-a-trip%2Fredeem-flights%2Fredeem-flight-awards.html%3Fauto_submit%3Dtrue%26recent_search%3Dow%26vs%3D2");
			target.search = params.toString();
			return target;
		}
		function response_parser(response, regex) {
			var result = response.match(regex);
			try {
				result = JSON.parse(result[1]);
			} catch (e) {
				result = false;
			}
			return result;
		}
		async function newTabID(signal) {
			log("Creating New Request Parameters...");
			let parameters = {};
			if (requestVars.ENC) {
				parameters.SERVICE_ID = "1";
				parameters.LANGUAGE = "TW";
				parameters.EMBEDDED_TRANSACTION = "AirAvailabilityServlet";
				parameters.SITE = "CXAWCXAW";
				parameters.ENC = requestVars.ENC;
				parameters.ENCT = "2";
				parameters.ENTRYCOUNTRY = "";
				parameters.ENTRYLANGUAGE = "";
			} else {
				alert("Error, No ENC.");
				return false;
			}
			var form_data = "";
			for (var key in parameters) form_data = form_data + key + "=" + parameters[key] + "&";
			log("Requesting New Tab ID...");
			let response;
			try {
				response = await gmHttp({
					method: "POST",
					url: "https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					data: form_data
				}, signal);
			} catch (e) {
				if (e instanceof HttpAbortError) return false;
				resetSearch();
				batchError(lang.tab_retrieve_fail);
				return false;
			}
			var errorBOM = "";
			var errorMessage = lang.tab_retrieve_fail;
			if (response.status == 200) {
				log("Tab ID Response Received. Parsing...");
				var data = response.responseText;
				requestVars = response_parser(data, /requestParams = JSON\.parse\(JSON\.stringify\('([^']+)/);
				if (!requestVars) {
					errorBOM = response_parser(data, /errorBom = ([^;]+)/);
					if (errorBOM?.modelObject?.step == "Error") errorMessage = errorBOM.modelObject?.messages[0]?.subText || errorMessage;
					log("Tab ID Could not be parsed.");
					batchError("<strong>錯誤：</strong>" + errorMessage + " (<a href='" + login_url + "'>登入</a>) ");
					resetSearch();
					return false;
				}
				tab_id = requestVars.TAB_ID ? requestVars.TAB_ID : "";
				log("New Tab ID: " + tab_id);
				batchError(false);
				form_submit_url = availability_url + tab_id;
				return true;
			} else {
				errorBOM = response_parser(response.responseText, /errorBom = ([^;]+)/);
				if (errorBOM?.modelObject?.step == "Error") errorMessage = errorBOM.modelObject?.messages[0]?.subText || errorMessage;
				log("Failed to receive Tab ID.");
				resetSearch();
				batchError("<strong>錯誤：</strong>" + errorMessage + " ( <a href='" + login_url + "'>登入</a> ) ");
				return false;
			}
		}
		function regularSearch(route = [{
			from: "TPE",
			to: "TYO",
			date: dateAdd(14)
		}], passengers = {
			adult: 1,
			child: 0
		}, cabinclass = "Y", is_cont_query = false, is_cont_batch = false, is_cont_saved = false, flexible = "false") {
			var target;
			if (route.length == 1) target = newQueryPayload(route[0], passengers, cabinclass, false, flexible);
			else if (route.length > 1) target = newMultiPayload(route, passengers, cabinclass);
			else return;
			btn_search.innerHTML = lang.searching;
			btn_search.classList.add("searching");
			if (is_cont_query) value_set("cont_query", "1");
			if (is_cont_batch) value_set("cont_batch", "1");
			if (is_cont_saved) value_set("cont_saved", "1");
			value_set("cont_ts", Date.now());
			if (window.location.href.indexOf("redeem-flight-awards.html") > -1) location.href = target;
			else {
				value_set("redirect_search", target.href);
				location.href = `https://www.cathaypacific.com/cx/${lang.el}_${lang.ec}/book-a-trip/redeem-flights/redeem-flight-awards.html`;
			}
		}
		async function runBatch(single_date, signal) {
			log("runBatch start");
			uef_from = input_from.value;
			uef_to = input_to.value;
			uef_date = dateVal();
			uef_adult = input_adult.value;
			uef_child = input_child.value;
			if (!cont_query && window.location.href.indexOf("air/booking/availability") > -1) {
				document.querySelectorAll("body > div").forEach((box) => {
					box.remove();
				});
				addCss(`html, body {overflow-x:inherit !important;} header {overflow-x:hidden;}`, document.body);
				document.body.append(shadowWrapper);
				shadowContainer.classList.add("results_container");
				document.body.classList.add("cont_query");
			} else if (!cont_query) {
				regularSearch([{
					from: uef_from.substring(0, 3),
					to: uef_to.substring(0, 3),
					date: uef_date
				}], {
					adult: uef_adult,
					child: uef_child
				}, "Y", true, true, false, false);
				return;
			}
			bulk_date = bulk_date ? bulk_date : dateVal();
			if (route_changed) {
				clearMatrix();
				bulk_date = dateVal();
				div_ue_container.scrollIntoView({
					behavior: "smooth",
					block: "start"
				});
				route_changed = false;
			}
			var rt_from = uef_from.split(",");
			var rt_to = uef_to.split(",");
			var query_count = rt_from.length * rt_to.length;
			var routes = [];
			rt_from.forEach((from) => {
				rt_to.forEach((to) => {
					routes.push({
						from,
						to
					});
				});
			});
			var days = single_date ? 1 : Math.max(1, Math.ceil(25 / query_count));
			for (var d = 0; d < days; d++) {
				if (signal.aborted) return;
				for (var r = 0; r < routes.length; r++) {
					if (signal.aborted) return;
					var bom = await searchAvailability(routes[r].from, routes[r].to, bulk_date, uef_adult, uef_child, signal);
					if (signal.aborted) return;
					if (bom) insertResults(routes[r].from, routes[r].to, bulk_date, bom);
				}
				bulk_date = dateAdd(1, bulk_date);
			}
			stop_batch();
		}
		function cacheGet(from, to, date) {
			return _availCache.get(from, to, date);
		}
		function cacheSet(from, to, date, bom) {
			_availCache.set(from, to, date, bom);
		}
		function compactBom(p) {
			return toCompactBom(p);
		}
		function searchSig() {
			if (!input_from) return "";
			return (input_from.value + "|" + input_to.value + "|" + dateVal() + "|" + input_adult.value + "|" + input_child.value).toUpperCase();
		}
		const MAX_KEY_RETRY = 4;
		async function searchAvailability(from, to, date, adult, child, signal) {
			if (signal?.aborted) return null;
			if (!/^[A-Z]{3}$/.test(to)) return { modelObject: {
				isContainingErrors: true,
				messages: [{ text: lang.invalid_code }]
			} };
			var cached = cacheGet(from, to, date);
			if (cached) return cached;
			var requests = { ...requestVars };
			requests.B_DATE_1 = date + "0000";
			requests.B_LOCATION_1 = from;
			requests.E_LOCATION_1 = to;
			requests["ORIGIN[1]"] = from;
			requests["DESTINATION[1]"] = to;
			requests["DEPARTUREDATE[1]"] = date;
			requests.TRIPTYPE = "O";
			requests.TRIP_TYPE = "O";
			delete requests.B_DATE_2;
			delete requests.B_LOCATION_2;
			delete requests.E_LOCATION_2;
			delete requests["ORIGIN[2]"];
			delete requests["DESTINATION[2]"];
			delete requests["DEPARTUREDATE[2]"];
			delete requests.DATE_RANGE_VALUE_2;
			delete requests.DATE_RANGE_QUALIFIER_2;
			delete requests.ENCT;
			delete requests.SERVICE_ID;
			delete requests.DIRECT_LOGIN;
			delete requests.ENC;
			var params = "";
			for (var key in requests) params = params + key + "=" + requests[key] + "&";
			for (var attempt = 0; attempt < MAX_KEY_RETRY; attempt++) {
				if (signal?.aborted) return null;
				let response;
				try {
					response = await gmHttp({
						method: "POST",
						url: form_submit_url,
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							"Accept": "application/json, text/plain, */*"
						},
						data: params
					}, signal);
				} catch (e) {
					if (e instanceof HttpAbortError) return null;
					batchError(lang.tab_retrieve_fail);
					return null;
				}
				if (response.status == 200) {
					batchError(false);
					let data;
					try {
						data = JSON.parse(response.responseText);
					} catch {
						batchError("Response not valid JSON.");
						return null;
					}
					var bom = null;
					if (data.modelObject) bom = compactBom(data);
					else if (data.pageBom) try {
						bom = compactBom(JSON.parse(data.pageBom));
					} catch (err) {}
					if (bom) {
						if (!bom.modelObject.isContainingErrors) cacheSet(from, to, date, bom);
						return bom;
					}
					batchError("modelObject does not exist.");
					return null;
				} else if (response.status == 404) {
					batchError(lang.key_exhausted);
					if (!await newTabID(signal)) return null;
					continue;
				} else if (response.status >= 300) {
					batchError(lang.getting_key);
					if (!await newTabID(signal)) return null;
					continue;
				} else return null;
			}
			return null;
		}
		function parseCxHash() {
			var m = /[#&]cxq=([^&]+)/.exec(location.hash || "");
			if (!m) return null;
			var p = decodeURIComponent(m[1]).split(",");
			if (p.length < 2 || !/^[A-Z]{3}$/.test(p[0]) || !/^[A-Z]{3}$/.test(p[1])) return null;
			return {
				from: p[0],
				to: p[1],
				date: p[2] || ""
			};
		}
		function postAvailToOpener(from, to, date, bom) {
			try {
				if (!window.opener || window.opener === window) return;
				var upsell = bom && bom.modelObject && bom.modelObject.availabilities && bom.modelObject.availabilities.upsell;
				var flights = upsell && upsell.bounds && upsell.bounds[0] && upsell.bounds[0].flights || [];
				var seats = {
					f: 0,
					j: 0,
					p: 0,
					y: 0
				};
				for (var i = 0; i < flights.length; i++) {
					var a = availForFlight(upsell, flights[i]) || {};
					seats.f = Math.max(seats.f, a.f || 0);
					seats.j = Math.max(seats.j, a.j || 0);
					seats.p = Math.max(seats.p, a.p || 0);
					seats.y = Math.max(seats.y, a.y || 0);
				}
				window.opener.postMessage({
					source: "cx-award",
					type: "avail",
					leg: {
						from,
						to,
						date: date || ""
					},
					seats
				}, "*");
				log("posted avail to App: " + from + "-" + to + " " + (date || "") + " " + JSON.stringify(seats));
			} catch (e) {
				log("postAvail error: " + e);
			}
		}
		async function runCxBridge() {
			try {
				var leg = parseCxHash();
				if (!leg || !window.opener) return;
				initCXvars();
				var bom = await searchAvailability(leg.from, leg.to, leg.date || dateAdd(14), 1, 0, null);
				postAvailToOpener(leg.from, leg.to, leg.date, bom);
			} catch (e) {
				log("cxBridge error: " + e);
			}
		}
		function applyCxHashToForm() {
			var leg = parseCxHash();
			if (!leg || !input_from || !input_to) return;
			input_from.value = leg.from;
			input_to.value = leg.to;
			value_set("uef_from", leg.from);
			value_set("uef_to", leg.to);
			var d = (leg.date || "").replace(/-/g, "");
			if (/^\d{8}$/.test(d) && input_date) {
				input_date.value = toDashedDate(d);
				value_set("uef_date", d);
			}
			batchLabel(lang.bulk_batch + " " + leg.from + " - " + leg.to + " " + lang.bulk_flights);
		}
		const matrix = createMatrix({
			lang,
			browserLang: browser_lang,
			saved,
			savedFlights: saved_flights,
			getStaticPath: function() {
				return static_path;
			},
			fromApp: !!(window.opener && window.opener !== window),
			afterMerge: function() {
				stickyFooter();
				if (autoScroll) shadowRoot.querySelector(".bulk_results").scrollIntoView({
					behavior: "smooth",
					block: "end",
					inline: "nearest"
				});
			}
		});
		function clearMatrix() {
			matrix.clearMatrix();
		}
		function toggleDay(date) {
			matrix.toggleDay(date);
		}
		function insertResults(from, to, date, pageBom) {
			matrix.merge(from, to, date, pageBom);
		}
		window.addEventListener("wheel", function() {
			autoScroll = window.innerHeight + window.scrollY >= document.body.scrollHeight;
		});
		window.addEventListener("touchmove", function() {
			autoScroll = window.innerHeight + window.scrollY >= document.body.scrollHeight;
		});
		function stickyFooter() {
			if (div_bulk_box.getBoundingClientRect().bottom < window.innerHeight) {
				div_footer.classList.remove("bulk_sticky");
				shadowRoot.querySelector(".bulk_results").style.paddingBottom = "0px";
			} else {
				div_footer.classList.add("bulk_sticky");
				shadowRoot.querySelector(".bulk_results").style.paddingBottom = "65px";
			}
		}
		function initSearchBox() {
			initCXvars();
			shadowContainer.appendChild(searchBox);
			assignElemets();
			mountSavedLists();
			mountStatus();
			elevate();
			addFormListeners();
			applyCxHashToForm();
			window.addEventListener("hashchange", function() {
				applyCxHashToForm();
				runCxBridge();
			});
			window.onscroll = function() {
				stickyFooter();
			};
			update_saved_count();
			update_saved_flights();
			autocomplete(input_from, "origins");
			autocomplete(input_to, "origins");
			getOrigins();
			if (cont_query) {
				reset_cont_vars();
				if (Date.now() - cont_ts > 300 * 1e3 && true) return;
				btn_batch.innerHTML = lang.searching_w_cancel;
				btn_batch.classList.add("bulk_searching");
				document.body.classList.add("cont_query");
				if (cont_saved) setTimeout(() => {
					saved_search();
				}, "1000");
				else setTimeout(() => {
					bulk_click(cont_batch ? false : true);
				}, "1000");
			}
		}
		if (window.location.href.indexOf("cathaypacific") > -1) initRoot();
	})();
})();
