import { useId } from "react";
import type { Color, PieceSymbol } from "chess.js";

export function ChessPiece({ color, type }: { color: Color; type: PieceSymbol }) {
  const id = useId().replace(/:/g, "");
  const white = color === "w";
  const edge = white ? "#5a4b3b" : "#f3e6cf";
  const plinth = white ? "#cbb892" : "#0e0c0a";
  return (
    <svg viewBox="0 0 45 45" className={type === "n" && !white ? "piece-svg face" : "piece-svg"} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="22%" y1="0%" x2="78%" y2="100%">
          <stop offset="0%" stopColor={white ? "#fffdf8" : "#6a635a"} />
          <stop offset="42%" stopColor={white ? "#f4e7d2" : "#2c2823"} />
          <stop offset="100%" stopColor={white ? "#e3d0b0" : "#12100d"} />
        </linearGradient>
      </defs>
      <g fill={`url(#${id}g)`} stroke={edge} strokeWidth={white ? 1.2 : 1.05} strokeLinejoin="round" strokeLinecap="round">
        {type === "p" && (
          <>
            <circle cx="22.5" cy="13.2" r="5.35" />
            <path d="M16.7 20.6c1.15-1.7 3.2-2.6 5.8-2.6s4.65.9 5.8 2.6c.35.55-.05 1.15-.7 1.15H17.4c-.65 0-1.05-.6-.7-1.15z" />
            <path d="M16.9 35.7h11.2c.55-5.5-.15-9.2-1.85-13.4-2.15.95-5.35.95-7.5 0-1.7 4.2-2.4 7.9-1.85 13.4z" />
          </>
        )}
        {type === "r" && (
          <>
            <path d="M11.6 11.4h5.1v3.15h3.15v-3.15h5.3v3.15h3.15v-3.15h5.1V17.6H11.6v-6.2z" />
            <path d="M14.3 17.6h16.4v11.4c-1.7 2.55-4.6 3.85-8.2 3.85s-6.5-1.3-8.2-3.85V17.6z" />
          </>
        )}
        {type === "n" && (
          <>
            <path d="M9.6 21.8c-1.2-2.2 1.1-5 4.2-4.7-.5-3.5 1.7-7.4 4.8-10.2 1.3-1.2 3.4-.1 2.9 1.8-.4 1.6.5 2.6 1.9 3 4.1-1.1 8.2 1.6 9.7 6 1.9 5.4 2.2 12.2.6 19.5H12.6c-.5-4.4 1.2-8 3.8-10.4-3.2-1.2-5.5-2.7-6.8-5z" />
            <circle cx="15.2" cy="18.6" r="1.15" fill={edge} stroke="none" />
            <path d="M12.4 21.2c1.5.7 2.6.5 3.6-.2" fill="none" strokeWidth="1.15" />
          </>
        )}
        {type === "b" && (
          <>
            <path d="M22.5 5.8c2.7 2.35 5.5 5.15 5.5 8.35 0 2.55-1.7 4.15-5.5 4.75-3.8-.6-5.5-2.2-5.5-4.75 0-3.2 2.8-6 5.5-8.35z" />
            <path d="M22.5 8.15v4.7" fill="none" strokeWidth="1.6" />
            <path d="M16.6 21.4c1.2-1.55 3.3-2.4 5.9-2.4s4.7.85 5.9 2.4c.4.55-.05 1.2-.7 1.2H17.3c-.65 0-1.1-.65-.7-1.2z" />
            <path d="M15.4 35.7h14.2c.2-3.7-.35-7.2-1.7-12.2-1.7 1.15-3.6 1.7-5.4 1.7s-3.7-.55-5.4-1.7c-1.35 5-1.9 8.5-1.7 12.2z" />
          </>
        )}
        {type === "q" && (
          <>
            <circle cx="8.6" cy="14.4" r="2.15" />
            <circle cx="15.6" cy="9.7" r="2.15" />
            <circle cx="22.5" cy="7.5" r="2.2" />
            <circle cx="29.4" cy="9.7" r="2.15" />
            <circle cx="36.4" cy="14.4" r="2.15" />
            <path d="M8.6 16.5c2.4 5.6 4.2 8.8 5.2 12.4h17.4c1-3.6 2.8-6.8 5.2-12.4-3.4 2.9-6.2 2.8-8.6.6-2 2.4-5.2 2.4-7.2 0-2.4 2.2-5.2 2.3-12 .6z" />
            <path d="M13.4 30.4h18.2v2.5c-2.1 2.2-5.5 3.3-9.1 3.3s-7-1.1-9.1-3.3v-2.5z" />
          </>
        )}
        {type === "k" && (
          <>
            <path d="M22.5 4.2v6.6M19.2 7.5h6.6" fill="none" strokeWidth="2.2" />
            <path d="M15.2 15.6h14.6l-1.55 5.8H16.75l-1.55-5.8z" />
            <path d="M17.2 21.6h10.6c.35.7.7 1.45.7 1.45H16.5s.35-.75.7-1.45z" />
            <path d="M16.2 23.2h12.6c1 4.3 1.75 8 1.95 12.4H14.25c.2-4.4.95-8.1 1.95-12.4z" />
          </>
        )}
        <path
          d="M10.7 36.2h23.6c.9 0 1.55.7 1.55 1.5v.85c0 .7-.55 1.25-1.25 1.25H10.4c-.7 0-1.25-.55-1.25-1.25v-.85c0-.8.65-1.5 1.55-1.5z"
          fill={plinth}
        />
      </g>
    </svg>
  );
}
