// Watermelon UI `floating-input`. Ajustado: la etiqueta flota por CSS (:placeholder-shown),
// así funciona con inputs controlados y un `onChange` propio; y queda asociada al input.
import { useId } from "react";
import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Fondo detrás de la etiqueta cuando flota; tiene que coincidir con el del contenedor. */
  labelClassName?: string;
}

export function FloatingInput({ label, className, labelClassName, id, ...props }: FloatingInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="relative">
      <input
        id={inputId}
        className={cn(
          "peer w-full px-4 py-3 border rounded-lg bg-transparent outline-none",
          "border-border focus:border-primary transition-colors",
          className
        )}
        placeholder=" "
        {...props}
      />
      <label
        htmlFor={inputId}
        className={cn(
          "absolute left-4 top-3 text-muted-foreground transition-all duration-200 pointer-events-none",
          "peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-xs peer-focus:px-1 peer-focus:text-primary",
          "peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:px-1",
          "bg-background",
          labelClassName
        )}
      >
        {label}
      </label>
    </div>
  );
}
