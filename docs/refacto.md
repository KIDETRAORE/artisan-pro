Voici le blueprint de refacto à figer avant le code.

1. Cible produit
Pages principales

Invoices = factures clients

PurchaseBills = factures fournisseurs

Actions > Chantier

Actions > Suivi compta

Insights IA

Rôle de chaque vue
Invoices

liste des factures clients

détail facture client

relances

échéances

paiement / statut

PurchaseBills

liste des factures fournisseurs

détail facture fournisseur

échéances fournisseurs

statut de paiement

suivi achats

Actions > Chantier

projets / chantiers

ventes liées au chantier

achats liés au chantier

marge chantier

dérive budget

anomalies chantier

paiements attendus / à faire

Actions > Suivi compta

relances clients

factures clients en retard

factures fournisseurs à échéance

trésorerie court terme

anomalies comptables

qualité de synchronisation

écarts / doublons / pièces manquantes

Insights IA

synthèse financière

alertes prioritaires

recommandations actionnables

2. Cible backend
Entités principales

sales_invoices

purchase_bills

payments

projects

Entités support à prévoir ensuite

contacts

invoice_lines

payment_allocations

attachments

external_id_map

sync_events

3. Mapping entre ancien et nouveau monde
Aujourd’hui

table unique invoices

page unique Invoices

sync Odoo/Pennylane vers un flux unique

Demain

ventes → sales_invoices

achats → purchase_bills

paiements → payments

chantiers → projects

Règle de migration

ne pas casser invoices tout de suite

créer les nouvelles tables en parallèle

migrer l’UI ensuite

supprimer l’ancien flux en dernier

4. Routes cibles
Backend

GET /sales-invoices

GET /sales-invoices/:id

POST /sales-invoices

PATCH /sales-invoices/:id

DELETE /sales-invoices/:id

GET /purchase-bills

GET /purchase-bills/:id

POST /purchase-bills

PATCH /purchase-bills/:id

GET /payments

GET /projects

GET /projects/:id

POST /integrations/odoo/sync-sales-invoices

POST /integrations/odoo/sync-purchase-bills

Frontend

/invoices

/invoices/:id

/purchase-bills

/purchase-bills/:id

/projects

/projects/:id

/actions/accounting

/actions/projects

5. Services backend cibles

SalesInvoicesService

PurchaseBillsService

PaymentsService

ProjectsService

Et côté sync :

syncSalesInvoices()

syncPurchaseBills()

syncPayments()

6. Règle de connecteurs comptables
Odoo

out_invoice → sales_invoices

in_invoice → purchase_bills

Plus tard pareil pour les autres logiciels :

Pennylane

Sage

Quickbooks

EBP

Indy

Tiime

Tous devront mapper vers le même modèle canonique.

7. Ordre réel de refacto
Étape 1

Figer ce blueprint.

Étape 2

Créer les nouvelles tables :

sales_invoices

purchase_bills

payments

projects

Étape 3

Créer les nouveaux services backend.

Étape 4

Brancher la sync ventes puis achats.

Étape 5

Créer la page PurchaseBills.

Étape 6

Faire évoluer Actions > Chantier et Actions > Suivi compta.

Étape 7

Migrer progressivement l’ancien flux invoices.

8. Première étape de code après ce blueprint

La première étape de code à faire est :

créer les nouvelles tables backend, sans encore casser l’existant.

Donc la prochaine action concrète est de définir le schéma SQL initial de :

sales_invoices

purchase_bills

payments

projects

C’est le meilleur point de départ.