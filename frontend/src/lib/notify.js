import { useEffect, useState } from "react";

const supported = () => typeof window !== "undefined" && "Notification" in window;

export function desktopNotify(title, body, onClick) {
  if (!supported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.svg", tag: `${title}:${body}`.slice(0, 64) });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

export function useNotificationPermission() {
  const [perm, setPerm] = useState(supported() ? Notification.permission : "unsupported");
  useEffect(() => {
    if (!supported()) return;
    const t = setInterval(() => setPerm(Notification.permission), 3000);
    return () => clearInterval(t);
  }, []);
  const request = async () => {
    if (!supported()) return "unsupported";
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") desktopNotify("Desktop alerts are on", "You'll be notified about replies and follow-ups due today.");
    return p;
  };
  return [perm, request];
}
