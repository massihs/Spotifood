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

## Notes Phase 3

- **Réorganisation** : drag & drop via dnd-kit (souris, tactile avec appui long, clavier : Espace puis flèches). Mise à jour optimiste, annulée si le serveur refuse. Le serveur exige la liste _complète_ : si un autre gérant a modifié le menu entre-temps, il répond `reorder_mismatch` et la page se recharge, au lieu d'appliquer un ordre partiel.
- **Catégories prédéfinies** : 24 modèles (`templateKey`) nommés dans la _langue par défaut du restaurant_, pas dans celle du gérant. Un modèle déjà utilisé ne peut pas être ajouté deux fois ; les catégories personnalisées (« Spécialités iraniennes ») coexistent.
- **Suppression** : une catégorie qui contient des produits ne peut pas être supprimée. Un produit supprimé est masqué (soft delete), son historique de commandes est conservé.
- **Épuisé vs masqué** : le staff peut marquer un plat « épuisé » pendant le service ; seul un gestionnaire du menu peut le masquer ou le modifier.
- **Options** : les choix gardent leur identifiant quand on les modifie (les paniers en cours restent valides) ; un choix retiré est soft-deleted. Règles validées : min ≤ max, assez de choix disponibles pour le minimum, pas plus de choix par défaut que le maximum.
- **Isolation** : un produit ne peut référencer que la catégorie, le taux de TVA et les groupes d'options de _son_ restaurant (testé).
- **Cache** : chaque modification du menu appelle `updateTag(menu:{restaurantId})`. Le menu client (Phase 4) sera mis en cache sous ce tag et toujours à jour.
- **Bug corrigé** (phases 1 à 3) : dans un `select` mono-table, Drizzle n'écrit pas le nom de table des colonnes, donc une sous-requête corrélée `… where x = ${table.id}` comparait la mauvaise colonne. Les compteurs « commandes par restaurant » et « restaurants par utilisateur » du Super Admin étaient faux. Toutes les sous-requêtes sont maintenant qualifiées explicitement, avec des tests de régression (voir `src/server/db/README.md`).
- **Mobile** : tous les écrans du dashboard sont vérifiés sans défilement horizontal à 390 px.

## Notes Phase 4

- **Entrée QR** (`GET /t/{jeton}`, route handler) : résout la table, identifie l'appareil (`sf_guest`, signé HMAC, 1 an), ouvre ou rejoint la session de table, attribue un siège (`sf_seat`, signé, 12 h) puis redirige vers `/table`. Le jeton du QR ne reste jamais dans l'URL de l'app.
- **Participants** : un appareil = un participant par session (« Client N », prénom facultatif). Rescanner redonne le même siège. Un cookie de siège copié sur un autre appareil, ou modifié, est refusé (testé en navigateur).
- **Concurrence** : premier scan simultané de 8 téléphones → une seule session (index unique partiel + retry) et des numéros de siège uniques (testé).
- **Clôture automatique** : appliquée paresseusement au scan suivant si la session est inactive depuis plus que le délai configuré **et** qu'il ne reste rien à payer. La clôture manuelle par le staff arrive avec la vue tables live (Phase 6).
- **Menu public** : `use cache` + `cacheTag(menu:{id})` + `cacheLife('hours')`. Chaque modification du dashboard appelle `updateTag` : un plat marqué épuisé apparaît immédiatement côté client (testé). Mesuré en local : TTFB ≈ 35–240 ms, ≈ 170 Ko de JS, scan → menu affiché < 1 s.
- **Prix** : moteur pur (`src/server/modules/pricing`) partagé client/serveur. Le client l'utilise pour l'affichage, le serveur recalcule **toujours** depuis la base (prix, options, min/max, disponibilité). Le panier est re-pricé à chaque lecture : une hausse de prix ou un plat épuisé est signalé dans le panier au lieu d'être commandé à l'ancien prix.
- **TVA** : calculée par taux sur les montants cumulés (un arrondi par taux), comme sur une facture.
- **PWA** : manifest + icônes (dont maskable) — « Ajouter à l'écran d'accueil » sur iOS et Android. Pas de service worker hors-ligne : une commande nécessite de toute façon le réseau.
- Le bouton « Commander » arrive en Phase 5 (création de commande, envoi en cuisine).
