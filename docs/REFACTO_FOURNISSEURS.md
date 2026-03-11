Les modifs à faire pour une vraie synchro fournisseurs

Le plus propre est de faire une seconde filière parallèle, comme pour les factures clients.

1. Connecteur Odoo : ajouter la lecture des factures fournisseurs

Fichier :

apps/backend/src/services/connectors/odoo.connector.ts

À faire :

garder listInvoices() pour les clients (out_invoice)

ajouter par exemple listVendorBills() pour les fournisseurs (in_invoice)

Exemple logique :

domain: [["move_type", "=", "in_invoice"]]

et mapper en objet canonique fournisseur.

2. Types du connecteur : ajouter un type fournisseur

Fichier :

apps/backend/src/services/connectors/accountingConnector.types.ts

À faire :

ajouter un type du genre :

ExternalVendorBill

ou un type commun si tu veux mutualiser

Avec des champs adaptés :

externalId

billNumber

supplierName

issueDate

dueDate

totalAmountCents

status

3. Service de sync : ajouter une sync dédiée fournisseurs

Fichier :

apps/backend/src/services/accountingSync.service.ts

Aujourd’hui tu as :

AccountingSyncService.syncInvoices(...)

À faire :

garder cette méthode pour les factures clients

ajouter une méthode du style :

AccountingSyncService.syncVendorBills(...)

Cette méthode devra :

appeler connector.listVendorBills()

faire le matching fournisseur

créer ou mettre à jour des enregistrements internes dédiés

4. Base de données : créer une table dédiée

Le plus propre est de ne pas réutiliser la table invoices.

À créer :

purchase_invoices

ou

vendor_bills

Avec des colonnes du genre :

id

user_id

supplier_name

supplier_email

issue_date

due_date

status

total_amount

total_amount_cents

bill_number

source_system

source_external_id

origin_type

created_at

Pourquoi une table séparée :

une facture client et une facture fournisseur n’ont pas la même sémantique

tes analyses IA seront plus propres

ton frontend sera beaucoup plus clair

5. Mapping externe : ajouter le support fournisseur

Fichier :

apps/backend/src/services/externalIdMap.service.ts

À faire :

supporter un externalEntityType comme :

"vendor_bill"

au lieu de seulement "invoice".

6. Matching : ajouter le matching fournisseur

Fichier :

apps/backend/src/services/accountingMatching.service.ts

Aujourd’hui le matching est centré sur les factures clients.

À faire :

ajouter une logique dédiée fournisseur, par exemple :

matchVendorBillCandidate(...)

avec matching sur :

sourceExternalId

billNumber

supplierName

issueDate

dueDate

totalAmountCents

7. Service métier backend : créer un service fournisseur

Le plus propre est d’ajouter un service dédié, par exemple :

apps/backend/src/services/vendorBills.service.ts

Avec :

createVendorBill(...)

listVendorBills(...)

getVendorBill(...)

patchVendorBill(...)

Ça évite de tordre InvoicesService pour lui faire gérer deux métiers différents.

8. Contrôleur backend : exposer des routes fournisseurs

Créer par exemple :

GET /vendor-bills
GET /vendor-bills/:id
POST /integrations/odoo/sync-vendor-bills

Fichiers probables :

apps/backend/src/controllers/vendorBills.controller.ts
apps/backend/src/controllers/integrations.controller.ts

Tu peux aussi décider que syncOdoo lance :

syncInvoices()

puis syncVendorBills()

dans le même job.

9. Worker / queue : lancer aussi la synchro fournisseurs

Fichiers probables :

apps/backend/src/workers/accountingSync.worker.ts
apps/backend/src/queues/accountingSync.queue.ts

À faire :

soit ajouter un nouveau type de job

soit faire que le job Odoo existant synchronise :

factures clients

puis factures fournisseurs

10. Frontend : ajouter une page dédiée fournisseurs

Le plus propre :

garder /invoices pour les factures clients

ajouter /vendor-bills ou /purchase-invoices pour les fournisseurs

Fichiers à prévoir :

apps/frontend/src/services/vendorBills.api.ts
apps/frontend/src/pages/VendorBills.tsx
apps/frontend/src/App.tsx

Et dans le frontend tu afficheras :

fournisseur

échéance

montant

statut

origine Odoo

anomalies IA achats/fournisseurs

En résumé : les fichiers à modifier / créer
À modifier

apps/backend/src/services/connectors/odoo.connector.ts

apps/backend/src/services/connectors/accountingConnector.types.ts

apps/backend/src/services/accountingSync.service.ts

apps/backend/src/services/accountingMatching.service.ts

apps/backend/src/services/externalIdMap.service.ts

apps/backend/src/controllers/integrations.controller.ts

apps/backend/src/workers/accountingSync.worker.ts

apps/backend/src/queues/accountingSync.queue.ts

apps/frontend/src/App.tsx

À créer

table SQL vendor_bills ou purchase_invoices

apps/backend/src/services/vendorBills.service.ts

apps/backend/src/controllers/vendorBills.controller.ts

apps/frontend/src/services/vendorBills.api.ts

apps/frontend/src/pages/VendorBills.tsx

La version la plus propre

Je te recommande ceci :

factures clients → table invoices

factures fournisseurs → table vendor_bills

Et dans Odoo :

out_invoice → sync vers invoices

in_invoice → sync vers vendor_bills

C’est la structure la plus saine pour :

ton backend

le frontend

les analyses IA

les dashboards futurs