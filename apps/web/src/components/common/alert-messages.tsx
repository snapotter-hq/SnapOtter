import type { ReactNode } from "react";

interface AlertMessagesProps {
  messages: string[];
  id?: string;
  className?: string;
}

/**
 * The text under a form field's outcome: one message as a plain alert, several
 * as a list inside one alert, so a password that breaks three rules says so at
 * once instead of one per retry (#2090). Repeated messages show once. Nothing
 * renders for no messages.
 */
export function AlertMessages({ messages, id, className }: AlertMessagesProps): ReactNode {
  const unique = [...new Set(messages)];
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return (
      <p id={id} role="alert" className={className}>
        {unique[0]}
      </p>
    );
  }
  return (
    <div id={id} role="alert" className={className}>
      <ul className="list-disc ps-5 space-y-1">
        {unique.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
