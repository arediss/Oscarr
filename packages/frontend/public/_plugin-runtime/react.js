const R = window.__OSCARR_REACT__;
export default R;
export const {
  // Hooks
  useState, useEffect, useCallback, useMemo, useRef, useContext,
  useReducer, useLayoutEffect, useImperativeHandle, useDebugValue,
  useSyncExternalStore, useTransition, useDeferredValue, useInsertionEffect,
  useId, startTransition,
  // Component primitives
  createElement, Fragment, Children, createContext, forwardRef, memo,
  lazy, Suspense,
  // Element introspection — used by Vidstack, Radix, Headless UI, etc.
  isValidElement, cloneElement,
  // Diagnostic / marker components
  StrictMode, Profiler,
  // Misc
  version,
} = R;
