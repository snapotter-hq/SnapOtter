import type { ReactNode } from "react";

interface ErrorMessagesProps {
  messages: string[];
  id?: string;
  className?: string;
}

/**
 * The error text under a form: one message as a plain alert, several as a list
 * inside one alert, so a password that breaks three rules says so at once
 * instead of one per retry (#2090). The change-password page lays out its list
 * the same way. Nothing renders for no messages.
 */
export function ErrorMessages({ messages, id, className }: ErrorMessagesProps): ReactNode {
  if (messages.length === 0) return null;
  if (messages.length === 1) {
    return (
      <p id={id} role="alert" className={className}>
        {messages[0]}
      </p>
    );
  }
  return (
    <div id={id} role="alert" className={className}>
      <ul className="list-disc ps-5 space-y-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
