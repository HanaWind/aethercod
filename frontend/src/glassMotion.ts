export const glassFade = {
  initial: { "--glass-strength": 0 },
  animate: { "--glass-strength": 1 },
  exit: { "--glass-strength": 0 },
};

export function glassSlide(offset: number) {
  return {
    initial: { ...glassFade.initial, marginTop: offset, marginBottom: -offset },
    animate: { ...glassFade.animate, marginTop: 0, marginBottom: 0 },
    exit: { ...glassFade.exit, marginTop: offset, marginBottom: -offset },
  };
}
