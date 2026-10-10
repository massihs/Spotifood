# Roadmap & avancement

Légende : ✅ fait · 🚧 en cours · ⏳ à venir

| Phase | Contenu                                                                                                                                                                                                                                                                       | État |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1     | Architecture, schéma DB complet + migration, auth (sessions DB, Argon2id), RBAC par permissions, isolation tenant, audit log, rate limit, i18n fr/en/fa/ar (RTL), design system, dashboard & super admin (restaurants, utilisateurs, stats, suspension), seed démo, tests, CI | ✅   |
| 2     | Paramètres restaurant, équipe & permissions, tables (CRUD, génération en masse), QR (SVG/PNG, régénération, désactivation, impression)                                                                                                                                        | ⏳   |
| 3     | Catégories (modèles globaux + perso, drag & drop), produits, images (sharp + storage), options/modifiers                                                                                                                                                                      | ⏳   |
| 4     | App client mobile : scan QR, session de table, participants, menu rapide, fiche produit, PWA                                                                                                                                                                                  | ⏳   |
| 5     | Panier serveur, commandes (recalcul prix, snapshot), suivi, multi-client                                                                                                                                                                                                      | ⏳   |
| 6     | Temps réel (LISTEN/NOTIFY + SSE), KDS, tables live, notifications                                                                                                                                                                                                             | ⏳   |
| 7     | Paiements : abstraction `PaymentProvider`, espèces/terminal/plus tard, mock en ligne, Stripe, webhooks, idempotence                                                                                                                                                           | ⏳   |
| 8     | Factures (numérotation, snapshot), PDF, email (outbox)                                                                                                                                                                                                                        | ⏳   |
| 9     | Avis, plaintes + photo                                                                                                                                                                                                                                                        | ⏳   |
| 10    | Analytics & historiques                                                                                                                                                                                                                                                       | ⏳   |
| 11    | Polish UX/UI, dark mode, accessibilité                                                                                                                                                                                                                                        | ⏳   |
| 12    | E2E Playwright, sécurité (CSP…), performance, OpenAPI                                                                                                                                                                                                                         | ⏳   |

## Notes Phase 1

- **Next.js 16 + Cache Components** : toute lecture de session est derrière `<Suspense>` et `connection()` ; les pages publiques (landing, login, signup) sont prérendues statiquement.
- Le proxy (`src/proxy.ts`) ne fait **aucune** autorisation : il négocie la locale et prolonge le cookie de session. L'autorisation est refaite côté serveur à chaque page/action (`requireRestaurant`, `requireSuperAdmin`).
- Un restaurant étranger ou inexistant renvoie **404** (jamais 403) pour ne pas révéler l'existence d'un autre tenant.
- Les produits de démo n'ont pas encore d'images : le pipeline d'upload (sharp + storage) arrive en Phase 3, avec des visuels placeholder.
- Les commandes de démo (multi-clients à une même table) seront ajoutées au seed en Phase 5, quand le service de commande existera — pour qu'elles passent par la même logique de calcul que la production.
