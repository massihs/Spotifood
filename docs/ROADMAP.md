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

## Notes Phase 2

- **Formulaires** : React 19 réinitialise un `<form action>` après chaque soumission, même en erreur. Les formulaires du dashboard passent par `useActionForm` / `<ActionForm>` (`src/components/ui/form.tsx`) qui conserve la saisie et ne réinitialise qu'en cas de succès si demandé.
- **Erreurs** : les actions renvoient des _codes_ (`label_taken`, `plan_limit_tables`…) traduits côté client (`errorCodes.*`), jamais des messages serveur bruts.
- **Quotas de plan** (`src/server/entitlements.ts`) : vérifiés dans la transaction, après un `SELECT … FOR UPDATE` sur le restaurant — deux créations concurrentes ne peuvent pas dépasser la limite (testé).
- **QR** : régénérer change le jeton → toutes les copies imprimées de l'ancien QR cessent de fonctionner immédiatement. Supprimer une table = soft delete + QR désactivé (l'historique des commandes reste intact). Suppression refusée si une session est ouverte.
- **Équipe** : un compte existant est simplement rattaché (son mot de passe n'est jamais touché) ; un nouveau compte reçoit un mot de passe initial choisi par le gérant (en attendant les invitations par email, Phase 8). Seuls les écarts aux permissions du rôle sont stockés, et personne ne peut accorder une permission qu'il n'a pas. Retirer un membre coupe ses sessions s'il n'a plus aucun restaurant.
- **Images** : format détecté sur les octets (jamais l'extension), SVG/GIF refusés, 8 Mo et ~40 Mpx max, orientation EXIF appliquée puis toutes les métadonnées supprimées (GPS…), ré-encodage WebP/PNG. Le même pipeline servira aux photos produits (Phase 3).
- **`/t/{token}`** : valide le QR et affiche restaurant + table. Il devient le menu client complet en Phase 4.
- La démo est sur l'offre **Professional** (le Free plafonne à 5 tables et 2 membres).
