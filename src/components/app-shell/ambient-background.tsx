/**
 * The layered canvas behind every screen: base gradient (body), noise, a 64 px grid, and
 * three large, heavily blurred light pools that drift slowly. Pure CSS, fixed and inert
 * (pointer-events: none), invisible in the light theme, and still under reduced motion.
 *
 * `intensity="hero"` (sign-in) makes the pools bigger and brighter; `"app"` keeps them faint
 * so tables and forms stay readable.
 */
export function AmbientBackground({
  intensity = "app",
  position = "fixed",
}: {
  intensity?: "app" | "hero";
  /** `fixed` behind the whole app; `absolute` inside a positioned panel. */
  position?: "fixed" | "absolute";
}) {
  const hero = intensity === "hero";
  return (
    <div
      aria-hidden
      className={`pointer-events-none inset-0 overflow-hidden opacity-0 transition-opacity duration-700 dark:opacity-100 ${position === "fixed" ? "fixed -z-10" : "absolute"}`}
    >
      <div className="noise absolute inset-0" />
      <div className="grid-lines absolute inset-0" />
      {/* primary pool: top centre, indigo */}
      <div
        className="blob top-[-30%] left-1/2 -translate-x-1/2 animate-float bg-[#5E6AD2] blur-[150px]"
        style={{
          width: hero ? 900 : 700,
          height: hero ? 1400 : 900,
          opacity: hero ? 0.25 : 0.12,
        }}
      />
      {/* secondary pool: left, purple / pink mix */}
      <div
        className="blob top-[20%] left-[-10%] animate-float-slow bg-[linear-gradient(135deg,#7c5cd6,#c95c9e)] blur-[120px]"
        style={{ width: 600, height: 800, opacity: hero ? 0.15 : 0.07 }}
      />
      {/* tertiary pool: right, indigo / blue */}
      <div
        className="blob top-[35%] right-[-8%] animate-float bg-[linear-gradient(225deg,#5E6AD2,#3b7dd8)] blur-[100px] [animation-delay:-4s]"
        style={{ width: 500, height: 700, opacity: hero ? 0.12 : 0.06 }}
      />
      {/* bottom accent */}
      <div
        className="blob bottom-[-20%] left-[30%] animate-pulse bg-[#5E6AD2] blur-[140px] [animation-duration:8s]"
        style={{ width: 700, height: 400, opacity: hero ? 0.1 : 0.05 }}
      />
    </div>
  );
}
