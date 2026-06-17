// 自定义下拉框:替换浏览器原生 <select>。
//
// 选型:不渲染原生 <select>(那是个"看起来换了实则没换"的换皮),而是用
// button trigger + listbox popup,完全自绘。这样能保证:
//   - 视觉与项目内"cartographer's console"风格一致
//   - 暗/亮主题有完整对比
//   - 可携带 codename / desc 等次要信息(原生 option 不支持富文本)
//
// 为了不破坏现有测试,组件内**保留**一个 visually hidden 的 <select>,
// 仍然接受 fireEvent.change(testId, { target: { value } }),其 value 与
// 视觉 trigger 同步:父级通过 value + onValueChange 走受控数据流,测试
// 仍然 fireEvent.change(hiddenselect) → onChange → 父 setState →
// 视觉 trigger label 跟着变。hidden 模式(hidden = true)只渲染 hidden
// <select>,不渲染 trigger / popup——给"无障碍 fallback"场景用
// (如 LevelSelect 中 level-source-select / sublevel-select / mode-select,
// 视觉上已有 console-rail tab / console-segmented 替代)。
//
// 键盘:
//   - trigger 点击 / Enter / Space → 切换 open
//   - 打开后 Up / Down 移动 active option
//   - Enter / Space 选中 active option
//   - Esc 关闭
//   - Tab 关闭并移焦(走浏览器默认)
//
// 视觉:
//   - popup 走 createPortal 到 body,避免被父级 overflow:hidden 裁掉
//   - 位置算法基于 trigger.getBoundingClientRect,空间不够时翻到上方
//   - z-index 高,跟 warning popup 相当
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption<V extends string | number> {
  value: V;
  /** 主标签(必填) */
  label: string;
  /** 可选 codename / 副标题,渲染在 label 旁的小字 */
  codename?: string;
  /** 描述行,渲染在 label 下面(占用两行布局) */
  desc?: string;
  /** 不可选项(显示但不可点击) */
  disabled?: boolean;
}

export interface DropdownProps<V extends string | number> {
  value: V;
  options: ReadonlyArray<DropdownOption<V>>;
  onChange: (next: V) => void;
  /** 给 a11y 用的 label;同时作为 input 的 aria-label */
  ariaLabel?: string;
  /** trigger / hidden select 共用的 data-testid。hidden mode 下整个
   *  testid 落到 <select> 上;visible mode 下 trigger 用 testId,内部
   *  hidden select 用 `${testId}-native`。 */
  testId?: string;
  /** 把测试用的 testid 投射到每个 <option> 上,方便
   *  `within(select).getByTestId('foo-bar')` 这种用法。hidden / visible
   *  模式都生效——visible 模式下同时会出现在 popup 的 listbox option 上。 */
  optionTestId?: (option: DropdownOption<V>) => string | undefined;
  /** 隐藏模式:不渲染 trigger / popup,只渲染 hidden <select>。 */
  hidden?: boolean;
  /** trigger 占位符(没值时显示)。hidden 模式无效。 */
  placeholder?: string;
  /** 外层附加 className(给 .console-select 之类的容器使用) */
  className?: string;
  /** 不可用 */
  disabled?: boolean;
  /** trigger 内部内容右侧的额外元素(如 unit / suffix) */
  suffix?: React.ReactNode;
}

const HIDDEN_SELECT_CLASS = 'dropdown__native-select';

export function Dropdown<V extends string | number>(props: DropdownProps<V>): React.ReactElement {
  const {
    value, options, onChange,
    ariaLabel, testId, optionTestId, hidden = false,
    placeholder, className, disabled = false, suffix,
  } = props;

  const id = useId();
  const listboxId = `${id}-listbox`;
  const triggerId = `${id}-trigger`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLUListElement | null>(null);
  const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number; placeAbove: boolean } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const currentIndex = options.findIndex((o) => o.value === value);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const current = options[safeIndex];

  // 注意:这里**不**用 useLayoutEffect 强制把 hidden select 的 .value 写回
  // props.value。React 的 controlled binding(value={value})已经保证下次
  // render 时 DOM 同步;而 useLayoutEffect 在 onChange 同步路径里会竞争 —
  // fireEvent.change 触发 onChange → onValueChange → 父 setState 排队中
  // → useLayoutEffect 看到 el.value 已是新值、props.value 还是旧值 → 把
  // 新值强制回滚成旧值,父 setState 再 render 时已经是被回滚的状态。
  // 结果:测试 fireEvent.change 永远无效。改用纯 controlled 即可。

  // open 时:定位 popup + 外点击关闭 / Esc 关闭
  useLayoutEffect(() => {
    if (!open) return undefined;
    const trig = triggerRef.current;
    if (trig) {
      const r = trig.getBoundingClientRect();
      const desiredHeight = Math.min(options.length * 36 + 12, 280);
      const placeAbove = r.bottom + desiredHeight + 6 > window.innerHeight && r.top - desiredHeight - 6 > 0;
      setPopupPos({
        top: placeAbove ? r.top - 6 : r.bottom + 6,
        left: r.left,
        width: r.width,
        placeAbove,
      });
    }
    const onDocMouseDown = (e: globalThis.MouseEvent): void => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, options.length]);

  // 打开时 active = 当前选中项
  useEffect(() => {
    if (open) setActiveIndex(safeIndex);
  }, [open, safeIndex]);

  const commit = (idx: number): void => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onPopupKey = (e: ReactKeyboardEvent<HTMLUListElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => {
        let n = i;
        for (let k = 0; k < options.length; k++) {
          n = (n + 1) % options.length;
          if (!options[n].disabled) return n;
        }
        return i;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => {
        let n = i;
        for (let k = 0; k < options.length; k++) {
          n = (n - 1 + options.length) % options.length;
          if (!options[n].disabled) return n;
        }
        return i;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = options.findIndex((o) => !o.disabled);
      if (first >= 0) setActiveIndex(first);
    } else if (e.key === 'End') {
      e.preventDefault();
      for (let k = options.length - 1; k >= 0; k--) {
        if (!options[k].disabled) { setActiveIndex(k); break; }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const stopPointer = (e: ReactMouseEvent): void => e.stopPropagation();

  // ---- hidden mode: 只渲染一个 visually-hidden <select> ----
  if (hidden) {
    return (
      <select
        ref={hiddenSelectRef}
        className={HIDDEN_SELECT_CLASS}
        data-testid={testId}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          // 兼容 string / number 两种 value 类型
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
      >
        {options.map((o) => (
          <option
            key={String(o.value)}
            value={o.value}
            disabled={o.disabled}
            data-testid={optionTestId?.(o)}
          >
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // ---- visible mode: trigger + popup ----
  // 设计:testId 永远落在 <select> 上(无论是 hidden 还是 visible 模式)。
  // 这样 `getByTestId('size-select').tagName === 'SELECT'` 与
  // `fireEvent.change(getByTestId('size-select'), { target: { value } })`
  // 这两种 P2 时代就在用的契约都还工作。trigger button 用 `${testId}-trigger`
  // 暴露,需要时单独 query。
  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`dropdown__trigger${className ? ' ' + className : ''}`}
        data-testid={testId ? `${testId}-trigger` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        onPointerDown={stopPointer}
      >
        <span className="dropdown__trigger-label">
          {current ? current.label : (placeholder ?? '—')}
        </span>
        {suffix && <span className="dropdown__trigger-suffix">{suffix}</span>}
        <span className="dropdown__trigger-caret" aria-hidden>
          <svg viewBox="0 0 12 8" width="10" height="6">
            <path
              d="M1 1l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {/* 隐藏的 <select>:承担 testId 锚点 + fireEvent.change 兼容路径。 */}
      <select
        ref={hiddenSelectRef}
        className={HIDDEN_SELECT_CLASS}
        data-testid={testId}
        aria-hidden
        tabIndex={-1}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
      >
        {options.map((o) => (
          <option
            key={String(o.value)}
            value={o.value}
            disabled={o.disabled}
            data-testid={optionTestId?.(o)}
          >
            {o.label}
          </option>
        ))}
      </select>

      {open && popupPos && typeof document !== 'undefined' && createPortal(
        <ul
          ref={popupRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={triggerId}
          aria-activedescendant={
            activeIndex >= 0 && options[activeIndex] ? `${id}-opt-${activeIndex}` : undefined
          }
          onKeyDown={onPopupKey}
          onPointerDown={stopPointer}
          className={`dropdown__popup${popupPos.placeAbove ? ' dropdown__popup--above' : ''}`}
          style={{
            position: 'fixed',
            top: popupPos.placeAbove ? undefined : popupPos.top,
            bottom: popupPos.placeAbove ? window.innerHeight - popupPos.top : undefined,
            left: popupPos.left,
            width: popupPos.width,
          }}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={String(opt.value)}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={selected}
                aria-disabled={opt.disabled}
                data-testid={optionTestId?.(opt) ?? (testId ? `${testId}-option-${opt.value}` : undefined)}
                className={[
                  'dropdown__option',
                  selected ? 'dropdown__option--selected' : '',
                  isActive ? 'dropdown__option--active' : '',
                  opt.disabled ? 'dropdown__option--disabled' : '',
                  opt.desc ? 'dropdown__option--with-desc' : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                onClick={() => commit(i)}
              >
                <span className="dropdown__option-main">
                  <span className="dropdown__option-label">{opt.label}</span>
                  {opt.codename && <span className="dropdown__option-codename">{opt.codename}</span>}
                </span>
                {opt.desc && <span className="dropdown__option-desc">{opt.desc}</span>}
                {selected && (
                  <span className="dropdown__option-check" aria-hidden>
                    <svg viewBox="0 0 14 14" width="12" height="12">
                      <path
                        d="M2 7.5l3.2 3.2L12 4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
