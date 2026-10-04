// MDA's page-header "Back" (_BackBtn): the first thing in every inner screen's header, top-left,
// where the eye starts — one look and place on every screen.

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 flex-none cursor-pointer self-start items-center gap-2 border-[1.5px] border-foreground bg-card pl-3 pr-4 text-[15px] font-semibold hover:bg-accent"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      Back
    </button>
  );
}
