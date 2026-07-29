import { motion } from "motion/react";

interface AudiMascotProps {
  mood: "happy" | "listening" | "quizzing" | "sleeping" | "celebrating" | "sad";
  className?: string;
}

// Audi — Audibook's mascot. An original character: a violet cat wearing
// over-ear headphones, drawn on a rounded-triangle head with tall pointed
// ears and a whiskered muzzle. Deliberately distinct from any existing
// app mascot in silhouette, species, and palette.
export default function AudiMascot({ mood, className = "w-40 h-40" }: AudiMascotProps) {
  const eyeOpen = mood !== "sleeping" && mood !== "sad";

  return (
    <div className={`relative flex items-center justify-center ${className}`} id="audi-mascot-container">
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-lg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Ambient listening glow */}
        <motion.circle
          cx="100"
          cy="106"
          r="78"
          fill="#6D4AFF"
          fillOpacity="0.1"
          animate={{
            scale: mood === "listening" ? [1, 1.1, 1] : 1,
            opacity: mood === "listening" ? [0.1, 0.2, 0.1] : 0.1,
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.g
          animate={
            mood === "celebrating"
              ? { y: [0, -10, 0], rotate: [0, -4, 4, 0] }
              : mood === "sleeping"
              ? { y: [0, 2, 0] }
              : {}
          }
          transition={{
            duration: mood === "celebrating" ? 0.6 : 3,
            repeat: mood === "celebrating" || mood === "sleeping" ? Infinity : 0,
            ease: "easeInOut",
          }}
          style={{ originX: "100px", originY: "120px" }}
        >
          {/* Ears — tall triangles, unmistakably feline */}
          <path d="M52,86 L58,36 L98,64 Z" fill="#6D4AFF" />
          <path d="M148,86 L142,36 L102,64 Z" fill="#6D4AFF" />
          <path d="M62,80 L66,50 L88,66 Z" fill="#FF8FB1" fillOpacity="0.75" />
          <path d="M138,80 L134,50 L112,66 Z" fill="#FF8FB1" fillOpacity="0.75" />

          {/* Head — wide rounded triangle, tapering to a soft chin */}
          <path
            d="M100,58 C142,58 158,86 158,112 C158,146 132,166 100,166 C68,166 42,146 42,112 C42,86 58,58 100,58 Z"
            fill="#6D4AFF"
          />

          {/* Muzzle patch */}
          <path
            d="M100,116 C124,116 132,130 132,141 C132,154 118,162 100,162 C82,162 68,154 68,141 C68,130 76,116 100,116 Z"
            fill="#F3EFFF"
          />

          {/* Eyes */}
          {eyeOpen ? (
            <>
              <motion.g
                animate={mood === "celebrating" ? { scaleY: 1 } : { scaleY: [1, 0.1, 1] }}
                transition={{
                  duration: mood === "celebrating" ? 0.3 : 4,
                  repeat: mood === "celebrating" ? 0 : Infinity,
                  repeatDelay: 3.5,
                }}
                style={{ originX: "100px", originY: "104px" }}
              >
                <ellipse cx="78" cy="104" rx="12" ry="14" fill="#1B1235" />
                <ellipse cx="122" cy="104" rx="12" ry="14" fill="#1B1235" />
                <circle cx="74" cy="99" r="4.2" fill="#ffffff" />
                <circle cx="118" cy="99" r="4.2" fill="#ffffff" />
              </motion.g>
            </>
          ) : mood === "sleeping" ? (
            <>
              <path d="M66,104 Q78,113 90,104" stroke="#1B1235" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              <path d="M110,104 Q122,113 134,104" stroke="#1B1235" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <path d="M66,108 Q78,96 90,108" stroke="#1B1235" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              <path d="M110,108 Q122,96 134,108" stroke="#1B1235" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            </>
          )}

          {/* Nose + mouth */}
          <motion.path
            d="M93,128 L107,128 L100,137 Z"
            fill="#FF7A45"
            animate={mood === "happy" || mood === "celebrating" ? { scale: [1, 1.12, 1] } : {}}
            transition={{ duration: 0.6, repeat: mood === "celebrating" ? Infinity : 0 }}
            style={{ originX: "100px", originY: "132px" }}
          />
          <path
            d={mood === "sad" ? "M88,152 Q100,144 112,152" : "M88,141 Q100,152 112,141"}
            stroke="#1B1235"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Whiskers */}
          <g stroke="#1B1235" strokeWidth="2.6" strokeLinecap="round" opacity="0.55">
            <path d="M64,132 L44,127" />
            <path d="M64,140 L43,141" />
            <path d="M136,132 L156,127" />
            <path d="M136,140 L157,141" />
          </g>

          {/* Headphones — always on; they are the brand signature */}
          <path
            d="M40,110 C34,54 166,54 160,110"
            stroke="#00B3A4"
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="28" y="96" width="24" height="40" rx="12" fill="#00B3A4" />
          <rect x="148" y="96" width="24" height="40" rx="12" fill="#00B3A4" />
          <rect x="36" y="106" width="8" height="20" rx="4" fill="#CFFAF5" />
          <rect x="156" y="106" width="8" height="20" rx="4" fill="#CFFAF5" />
        </motion.g>

        {/* Sound waves while listening */}
        {mood === "listening" && (
          <g>
            {[0, 1].map((i) => (
              <motion.g key={i}>
                <motion.path
                  d={i === 0 ? "M22,96 Q12,110 22,124" : "M178,96 Q188,110 178,124"}
                  stroke="#00B3A4"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.9, 1.1, 0.9] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3 }}
                />
              </motion.g>
            ))}
          </g>
        )}

        {/* Sleeping Zs */}
        {mood === "sleeping" && (
          <g>
            <motion.text
              x="148"
              y="60"
              fill="#00B3A4"
              fontSize="17"
              fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [60, 44] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Z
            </motion.text>
            <motion.text
              x="165"
              y="40"
              fill="#00B3A4"
              fontSize="23"
              fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [40, 22] }}
              transition={{ duration: 3, repeat: Infinity, delay: 1 }}
            >
              Z
            </motion.text>
          </g>
        )}

        {/* Celebration sparks */}
        {mood === "celebrating" && (
          <g>
            {[
              { x: 30, y: 60 },
              { x: 170, y: 66 },
              { x: 44, y: 168 },
              { x: 158, y: 172 },
            ].map((p, i) => (
              <motion.circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="5"
                fill={i % 2 ? "#FF7A45" : "#FFC53D"}
                animate={{ scale: [0, 1.3, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
