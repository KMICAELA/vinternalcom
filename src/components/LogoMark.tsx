import logo from "@/assets/logo-1200.png";

const LogoMark = ({ size = 28 }: { size?: number }) => (
  <img src={logo} alt="1200 VC" width={size} height={size} className="object-contain" />
);

export default LogoMark;
