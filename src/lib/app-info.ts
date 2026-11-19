import packageInfo from "../../package.json";

const optionalContact = {
  supportEmail: "comunicacion.difusion@slp.tecnm.mx" as string | null,
  supportPhone: "444 818 2136" as string | null,
  facebookUrl: "https://www.facebook.com/ItslpOficial/?locale=es_LA" as string | null,
  // TODO: Agregar únicamente el perfil oficial de Instagram cuando se confirme.
  instagramUrl: null as string | null,
};

export const appInfo = {
  name: "Banco Académico",
  version: packageInfo.version,
  moduleName: "Acceso al sistema",
  teamName: "Equipo de desarrollo Banco Académico",
  institution: "Instituto Tecnológico de San Luis Potosí",
  interfaceUpdatedAt: "04 de noviembre de 2026",
  websiteUrl: "https://slp.tecnm.mx/",
  helpdeskUrl: "https://slp.tecnm.mx/directorio/",
  manualPagePath: "/manual",
  manualPdfPath: "/manual/manual-usuario.pdf",
  ...optionalContact,
} as const;
