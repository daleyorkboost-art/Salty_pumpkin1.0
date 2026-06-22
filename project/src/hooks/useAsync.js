import { useEffect, useState } from "react";

export function useAsync(task, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  async function run() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await task();
      setState({ loading: false, data, error: "" });
      return data;
    } catch (error) {
      setState({ loading: false, data: null, error: error.message || "Something went wrong" });
      return null;
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const data = await task();
        if (active) setState({ loading: false, data, error: "" });
      } catch (error) {
        if (active) setState({ loading: false, data: null, error: error.message || "Something went wrong" });
      }
    }
    load();
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  async function reload() {
    return run();
  }

  return { ...state, reload };
}
