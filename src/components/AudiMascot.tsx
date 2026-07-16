import { motion } from "motion/react";

interface AudiMascotProps {
  mood: "happy" | "listening" | "quizzing" | "sleeping" | "celebrating" | "sad";
  className?: string;
}

export default function AudiMascot({ mood, className = "w-40 h-40" }: AudiMascotProps) {
  // SVG drawing dimensions: width 200, height 200
  return (
    <div className={`relative flex items-center justify-center ${className}`} id="audi-mascot-container">
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-lg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background Ambient Glow */}
        <motion.circle
          cx="100"
          cy="100"
          r="80"
          fill="#58cc02"
          fillOpacity="0.1"
          animate={{
            scale: mood === "listening" ? [1, 1.1, 1] : 1,
            opacity: mood === "listening" ? [0.1, 0.2, 0.1] : 0.1,
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Head & Body (Merged Egg-like shape Duolingo style) */}
        <motion.path
          d="M50,110 C50,60 150,60 150,110 C150,150 130,170 100,170 C70,170 50,150 50,110 Z"
          fill="#58cc02" // Vibrant green
          animate={
            mood === "celebrating"
              ? { y: [0, -10, 0], scaleY: [1, 0.9, 1.1, 1] }
              : mood === "sleeping"
              ? { scaleY: [1, 0.97, 1] }
              : {}
          }
          transition={{
            duration: mood === "celebrating" ? 0.6 : 3,
            repeat: mood === "sleeping" ? Infinity : 0,
            ease: "easeInOut",
          }}
        />

        {/* Soft Tummy Patch (Light Lime green) */}
        <path
          d="M75,120 C75,95 125,95 125,120 C125,145 115,155 100,155 C85,155 75,145 75,120 Z"
          fill="#84e022"
        />

        {/* Dynamic Feathery texture details on Tummy */}
        <path d="M92,115 C95,118 105,118 108,115" stroke="#58cc02" strokeWidth="3" strokeLinecap="round" />
        <path d="M88,128 C92,132 108,132 112,128" stroke="#58cc02" strokeWidth="3" strokeLinecap="round" />
        <path d="M93,140 C96,143 104,143 107,140" stroke="#58cc02" strokeWidth="3" strokeLinecap="round" />

        {/* Face Mask/Feather highlights around Eyes (White/Cream patches) */}
        <circle cx="82" cy="98" r="24" fill="#ffffff" />
        <circle cx="118" cy="98" r="24" fill="#ffffff" />

        {/* EYES (Duolingo style large expressive eyes) */}
        {/* Left Eye */}
        <g id="left-eye">
          {mood === "sleeping" ? (
            // Curved closed eye line
            <path d="M68,98 Q82,108 92,98" stroke="#333" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          ) : mood === "sad" ? (
            // Sad downward slanting curves
            <path d="M70,102 Q82,90 92,102" stroke="#333" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          ) : (
            <>
              {/* Outer Eye Circle */}
              <motion.circle
                cx="82"
                cy="98"
                r="13"
                fill="#1f2937"
                animate={mood === "celebrating" ? { scaleY: 1.1 } : { scaleY: [1, 0.1, 1] }}
                transition={{
                  duration: mood === "celebrating" ? 0.3 : 4,
                  repeat: mood === "celebrating" ? 0 : Infinity,
                  repeatDelay: 3.5,
                }}
              />
              {/* Eye sparkle reflection */}
              <circle cx="79" cy="94" r="4.5" fill="#ffffff" />
            </>
          )}
        </g>

        {/* Right Eye */}
        <g id="right-eye">
          {mood === "sleeping" ? (
            // Curved closed eye line
            <path d="M108,98 Q118,108 132,98" stroke="#333" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          ) : mood === "sad" ? (
            <path d="M108,102 Q118,90 130,102" stroke="#333" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          ) : (
            <>
              {/* Outer Eye Circle */}
              <motion.circle
                cx="118"
                cy="98"
                r="13"
                fill="#1f2937"
                animate={mood === "celebrating" ? { scaleY: 1.1 } : { scaleY: [1, 0.1, 1] }}
                transition={{
                  duration: mood === "celebrating" ? 0.3 : 4,
                  repeat: mood === "celebrating" ? 0 : Infinity,
                  repeatDelay: 3.5,
                }}
              />
              <circle cx="115" cy="94" r="4.5" fill="#ffffff" />
            </>
          )}
        </g>

        {/* Cute Beak (Orange Triangle) */}
        <motion.path
          d="M94,103 L106,103 L100,116 Z"
          fill="#ff9600"
          stroke="#e07b00"
          strokeWidth="1.5"
          strokeLinejoin="round"
          animate={
            mood === "happy" || mood === "celebrating"
              ? { scale: [1, 1.15, 1], y: [0, -2, 0] }
              : {}
          }
          transition={{ duration: 0.5, repeat: mood === "celebrating" ? Infinity : 0 }}
        />

        {/* Rosy Cheeks (Blush) */}
        <circle cx="64" cy="112" r="6" fill="#ff4b4b" fillOpacity="0.4" />
        <circle cx="136" cy="112" r="6" fill="#ff4b4b" fillOpacity="0.4" />

        {/* Little tufts of feathers on top of head */}
        <path d="M92,62 C90,50 98,46 98,46 C98,46 102,52 100,62" fill="#58cc02" />
        <path d="M104,62 C106,52 112,48 112,48 C112,48 112,54 108,62" fill="#58cc02" />

        {/* Headphone asset (Only shown when mood is 'listening' or 'happy') */}
        {mood === "listening" && (
          <motion.g
            id="headphones"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
          >
            {/* Band over the head */}
            <path
              d="M44,110 C30,40 170,40 156,110"
              stroke="#22d3ee" // Bright Cyan
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            {/* Left Ear Muff */}
            <rect x="36" y="98" width="14" height="26" rx="7" fill="#0891b2" />
            <rect x="44" y="103" width="6" height="16" rx="3" fill="#ffffff" />

            {/* Right Ear Muff */}
            <rect x="150" y="98" width="14" height="26" rx="7" fill="#0891b2" />
            <rect x="150" y="103" width="6" height="16" rx="3" fill="#ffffff" />
          </motion.g>
        )}

        {/* Musical/Speech notes floating when listening */}
        {mood === "listening" && (
          <g id="floating-notes">
            {/* Note 1 */}
            <motion.path
              d="M30,70 L30,55 A5,5 0 0 1 35,50 L45,52 L45,64"
              stroke="#22d3ee"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              animate={{ y: [0, -12, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0 }}
            />
            <circle cx="26" cy="70" r="4" fill="#22d3ee" />

            {/* Note 2 */}
            <motion.path
              d="M175,75 L175,60 A5,5 0 0 1 180,55 L190,57 L190,69"
              stroke="#22d3ee"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              animate={{ y: [0, -15, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1 }}
            />
            <circle cx="171" cy="75" r="4" fill="#22d3ee" />
          </g>
        )}

        {/* Sleeping particles (Zs) */}
        {mood === "sleeping" && (
          <g id="sleeping-zs">
            <motion.text
              x="145"
              y="65"
              fill="#0891b2"
              fontSize="16"
              fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [0, -15], x: [145, 150] }}
              transition={{ duration: 3, repeat: Infinity, delay: 0 }}
            >
              Z
            </motion.text>
            <motion.text
              x="160"
              y="45"
              fill="#0891b2"
              fontSize="22"
              fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [0, -20], x: [160, 168] }}
              transition={{ duration: 3, repeat: Infinity, delay: 1 }}
            >
              Z
            </motion.text>
          </g>
        )}
      </svg>
    </div>
  );
}
