import { Loader2 } from "lucide-react";

export default function Spinner({ className = "h-4 w-4" }) {
  return <Loader2 className={`animate-spin text-accent-500 ${className}`} />;
}
