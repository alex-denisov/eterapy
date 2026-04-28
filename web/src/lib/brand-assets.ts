export const brandAssets = {
  logos: {
    horizontalDark: "/brand/logos/eterapy_logo_horizontal_dark_official.png",
    horizontalLight: "/brand/logos/eterapy_logo_horizontal_light_official.png",
    systemRu: "/brand/logos/eterapy_logo_system_ru_official.png",
    systemEn: "/brand/logos/eterapy_logo_system_en_official.png",
    primaryLockupRuDark: "/brand/logos/eterapy_primary_lockup_ru_dark_crop.png",
    darkRu: "/brand/logos/eterapy_dark_version_ru_crop.png",
    lightRu: "/brand/logos/eterapy_light_version_ru_crop.png",
  },
  icons: {
    appDark1024: "/brand/icons/eterapy_app_icon_dark_1024.png",
    appDark512: "/brand/icons/eterapy_app_icon_dark_512.png",
    appDark256: "/brand/icons/eterapy_app_icon_dark_256.png",
    appDarkTransparentMaster: "/brand/icons/eterapy_app_icon_dark_transparent_master.png",
    standaloneTransparent1024: "/brand/icons/eterapy_standalone_icon_transparent_1024.png",
    standaloneTransparent512: "/brand/icons/eterapy_standalone_icon_transparent_512.png",
    standaloneTransparentMaster: "/brand/icons/eterapy_standalone_icon_transparent_master.png",
    standaloneLightBg1024: "/brand/icons/eterapy_standalone_icon_light_bg_1024.png",
    standaloneLightBgMaster: "/brand/icons/eterapy_standalone_icon_light_bg_master.png",
    standaloneDarkRuCrop: "/brand/icons/eterapy_standalone_icon_dark_ru_crop.png",
  },
  favicon: {
    ico: "/favicon/favicon.ico",
    png16: "/favicon/favicon_16x16.png",
    png32: "/favicon/favicon_32x32.png",
    png48: "/favicon/favicon_48x48.png",
    png64: "/favicon/favicon_64x64.png",
    apple180: "/favicon/favicon_180x180.png",
    png192: "/favicon/favicon_192x192.png",
    png256: "/favicon/favicon_256x256.png",
    png512: "/favicon/favicon_512x512.png",
    manifest: "/favicon/site.webmanifest",
  },
  tokens: {
    css: "/brand/tokens/eterapy_brand_tokens.css",
    json: "/brand/tokens/eterapy_brand_tokens.json",
  },
} as const;

export type BrandAssets = typeof brandAssets;
