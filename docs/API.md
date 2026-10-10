# API

Le back-office utilise des **Server Actions** (même couche service, même validation Zod, mêmes contrôles de permission).
Les endpoints REST ci-dessous servent les fichiers et intégrations. Erreurs normalisées :

```json
{ "error": { "code": "NOT_FOUND", "message": "..." } }
```

Codes : `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `VALIDATION` 422 · `RATE_LIMITED` 429 · `TENANT_SUSPENDED` 423 · `PLAN_LIMIT` 402.
Un restaurant étranger ou inexistant répond toujours **404**.

## Fichiers publics

### `GET /api/v1/files/{key}`

Sert les assets publics (logos, photos produits) quand le stockage n'a pas d'URL publique (driver local).
Seules les clés `r/{restaurantId}/(logo|product)/{random}-{variant}.(webp|png)` sont servies ; tout le reste → 404.
`Cache-Control: public, max-age=31536000, immutable` (les clés changent à chaque upload).

## Tables

### `GET /api/v1/restaurants/{restaurantId}/tables/{tableId}/qr`

QR code d'une table. Authentifié (cookie de session), permission `tables.view`.

| Paramètre  | Valeurs                                     | Défaut |
| ---------- | ------------------------------------------- | ------ |
| `format`   | `svg`, `png`                                | `svg`  |
| `size`     | 128 – 4096 (px, PNG)                        | 1024   |
| `download` | présent → `Content-Disposition: attachment` | —      |

Le QR encode `{APP_URL}/t/{qrToken}` : un jeton aléatoire de 22 caractères (≈131 bits), régénérable.
Correction d'erreur niveau **H** (≈30 %) pour rester lisible imprimé petit ou abîmé.

## Client

### `GET /t/{qrToken}` (page)

Point d'entrée de chaque QR. `noindex`, `Referrer-Policy: no-referrer`.
Jeton inconnu, QR désactivé, table supprimée ou restaurant suspendu → page « QR code inactif ».
