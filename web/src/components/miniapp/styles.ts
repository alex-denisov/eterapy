import styles from "@/app/miniapp/miniapp-v21.module.css";

export { styles };

export function miniAppClass(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).map((name) => styles[name as string]).join(" ");
}
