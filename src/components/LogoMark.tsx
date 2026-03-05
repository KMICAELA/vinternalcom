const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28">
    <polygon
      points="14,2 25,8 25,20 14,26 3,20 3,8"
      fill="none"
      stroke="hsl(45, 90%, 55%)"
      strokeWidth="1.5"
    />
    <text
      x="14"
      y="18"
      textAnchor="middle"
      fill="hsl(45, 90%, 55%)"
      fontSize="10"
      fontWeight="bold"
      fontFamily="sans-serif"
    >
      12
    </text>
  </svg>
);

export default LogoMark;
