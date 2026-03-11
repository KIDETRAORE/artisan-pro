je vais te proposer le modèle de données canonique idéal pour ton application afin de supporter :

Odoo

Pennylane

Sage

Quickbooks

EBP

Indy

Tiime

etc.

L’objectif est que ton app devienne une couche intelligente au-dessus de la comptabilité, sans dépendre d’un logiciel spécifique.

Architecture comptable canonique recommandée pour ton app

L’idée est de ne jamais dépendre du modèle Odoo.

Chaque connecteur fait un mapping vers ton modèle interne.

Odoo
Pennylane
Sage
Quickbooks
EBP
        ↓
Connecteurs
        ↓
Modèle canonique ArtisanPro
        ↓
IA / Analytics / UX
1️⃣ Tiers (contacts)

Table :

contacts

Champs principaux :

id
user_id
name
type              ("client" | "supplier" | "both")
email
phone
address
city
postal_code
country
vat_number
created_at

Pourquoi c'est important :

un artisan travaille souvent avec les mêmes clients et fournisseurs

permet d’analyser :

dépendance client

fournisseurs dominants

retards par client

2️⃣ Factures clients

Table :

sales_invoices

Champs :

id
user_id
contact_id
invoice_number
status
issue_date
due_date
currency
subtotal_cents
tax_cents
total_cents
paid_at
source_system
source_external_id
origin_type
created_at

Statuts :

draft
sent
paid
overdue
canceled
3️⃣ Factures fournisseurs

Table :

purchase_bills

Champs :

id
user_id
supplier_id
bill_number
status
issue_date
due_date
subtotal_cents
tax_cents
total_cents
paid_at
source_system
source_external_id
created_at

Statuts :

draft
posted
paid
overdue
canceled

⚠️ C’est la séparation clé à faire dans ton architecture.

Ne mélange pas :

sales_invoices
purchase_bills
4️⃣ Lignes de facture

Table :

invoice_lines

Champs :

id
invoice_id
type ("sale" | "purchase")
description
quantity
unit_price_cents
tax_rate
total_cents
project_id

Pourquoi c’est important :

Pour analyser :

marge chantier

dépenses matériaux

sous-traitance

5️⃣ Paiements

Table :

payments

Champs :

id
user_id
type ("inbound" | "outbound")
contact_id
amount_cents
currency
payment_date
method
reference
source_system
source_external_id
created_at

Puis table :

payment_allocations
payment_id
invoice_id
amount_cents

Permet :

paiements partiels

règlements multiples

6️⃣ Chantiers / projets

Table :

projects

Champs :

id
user_id
name
client_id
status
start_date
end_date
budget_cents
7️⃣ Comptabilité analytique

Table :

analytic_entries

Champs :

id
invoice_line_id
project_id
amount_cents
type ("revenue" | "expense")

Permet :

marge chantier = revenus - dépenses

C'est le KPI le plus important pour un artisan.

8️⃣ Taxes

Table :

tax_breakdowns
invoice_id
tax_rate
base_cents
tax_cents

Permet :

TVA collectée

TVA déductible

contrôle TVA

9️⃣ Pièces jointes

Table :

attachments
id
entity_type
entity_id
file_url
mime_type
source_system
created_at

Permet :

PDF facture

justificatifs fournisseurs

🔟 Mapping externe

Table existante :

external_id_map

Parfait.

user_id
source_system
external_entity_type
external_id
internal_id
Connecteurs futurs

Chaque logiciel fera un mapping :

Logiciel	Factures clients	Factures fournisseurs
Odoo	out_invoice	in_invoice
Pennylane	customer_invoice	supplier_invoice
Sage	sales_invoice	purchase_invoice
Quickbooks	invoice	bill
Données IA à calculer

Ton IA pourra générer automatiquement :

trésorerie
cash_in_next_30_days
cash_out_next_30_days
cash_gap
clients
top_clients
late_payment_ratio
avg_payment_delay
fournisseurs
supplier_concentration
cost_drift
price_variation
chantiers
margin_per_project
material_vs_labor_ratio
overbudget_detection
anomalies
duplicate_invoice
invoice_without_reference
supplier_bill_without_project
invoice_paid_without_payment
late_supplier_payment
Architecture finale recommandée
contacts
projects

sales_invoices
purchase_bills

invoice_lines

payments
payment_allocations

analytic_entries

tax_breakdowns

attachments

external_id_map
sync_events
Bénéfice produit

Ton app devient :

ERP léger + IA financière

et non pas :

un simple miroir comptable
Si tu veux, je peux aussi te montrer la prochaine étape critique

👉 l’architecture multi-connecteurs comptables pour supporter :

Odoo
Pennylane
Sage
Quickbooks
EBP
Tiime
Indy

sans jamais refaire le backend.

Et ça, c’est la clé pour que ton app devienne un hub comptable universel pour artisans.

ok

Parfait. On va maintenant voir l’architecture multi-connecteurs comptables qui permettra à ton app de supporter tous les logiciels utilisés par les artisans sans refactor plus tard.

C’est probablement l’architecture la plus importante pour ton produit.

1️⃣ Principe : architecture “Accounting Hub”

Ton application devient un hub comptable universel.

Logiciels comptables
(Odoo / Pennylane / Sage / Quickbooks / EBP / Tiime / Indy)

        ↓
Connecteurs

        ↓
Modèle canonique ArtisanPro

        ↓
IA + Analytics + UX

Donc :

👉 les logiciels ne parlent jamais directement à ton app

Ils parlent à un connecteur dédié.

2️⃣ Interface commune des connecteurs

Tu as déjà une bonne base :

AccountingConnector

Mais la vraie interface idéale doit exposer toutes les entités utiles.

Exemple :

export interface AccountingConnector {
  provider: AccountingSource;

  testConnection(): Promise<void>;

  listContacts(): Promise<ExternalContact[]>

  listSalesInvoices(): Promise<ExternalInvoice[]>

  listPurchaseBills(): Promise<ExternalBill[]>

  listPayments(): Promise<ExternalPayment[]>

  getInvoice(externalId: string): Promise<ExternalInvoice>

  createInvoice(input: CanonicalInvoiceInput): Promise<{ externalId: string }>
}
3️⃣ Types externes
Contact
export type ExternalContact = {
  externalId: string
  name: string
  email?: string | null
  phone?: string | null
  type: "client" | "supplier" | "both"
}
Facture client
export type ExternalInvoice = {
  externalId: string
  invoiceNumber: string | null
  clientName: string | null
  issueDate: string | null
  dueDate: string | null
  totalAmountCents: number | null
  currency: string
  status: string | null
  rawPayload?: unknown
}
Facture fournisseur
export type ExternalBill = {
  externalId: string
  billNumber: string | null
  supplierName: string | null
  issueDate: string | null
  dueDate: string | null
  totalAmountCents: number | null
  currency: string
  status: string | null
  rawPayload?: unknown
}
Paiement
export type ExternalPayment = {
  externalId: string
  invoiceExternalId: string | null
  amountCents: number | null
  currency: string
  paymentDate: string | null
  rawPayload?: unknown
}
4️⃣ Factory de connecteurs

Tu as déjà :

AccountingConnectorFactory

Elle doit simplement faire :

switch(provider) {

case "odoo":
  return new OdooConnector(config)

case "pennylane":
  return new PennylaneConnector(config)

case "sage":
  return new SageConnector(config)

case "quickbooks":
  return new QuickbooksConnector(config)

}
5️⃣ Synchronisation générique

Ton AccountingSyncService devient :

syncContacts()

syncSalesInvoices()

syncPurchaseBills()

syncPayments()

Chaque connecteur implémente ses endpoints.

6️⃣ Mapping par logiciel

Exemple Odoo :

Canonique	Odoo
Sales invoice	out_invoice
Purchase bill	in_invoice
Credit note	out_refund
Supplier credit	in_refund
Payment	account.payment
Contact	res.partner

Pennylane :

Canonique	Pennylane
Sales invoice	customer_invoice
Purchase bill	supplier_invoice
Payment	payment

Quickbooks :

Canonique	Quickbooks
Sales invoice	invoice
Purchase bill	bill
Payment	payment
7️⃣ Stratégie de synchronisation

Deux stratégies possibles.

Pull (recommandé)

Ton app va chercher les données.

cron / worker
   ↓
connector.listInvoices()
   ↓
sync

Avantages :

fiable

universel

Webhooks

Certains logiciels :

Quickbooks

Pennylane

Stripe

peuvent envoyer des events.

8️⃣ Sync incrémentale

Toujours stocker un cursor.

Exemple :

integrations.last_sync_at

Puis :

connector.listInvoices({ since: lastCursor })
9️⃣ Gestion des doublons

Tu as déjà la bonne table :

external_id_map

Exemple :

odoo
external_id = 7834
internal_id = invoice_123
🔟 Worker de synchronisation

Idéalement :

BullMQ queue

Job :

sync_accounting

Flow :

sync contacts
sync sales invoices
sync purchase bills
sync payments
11️⃣ Gestion des capacités

Tous les logiciels ne supportent pas tout.

Donc :

connector.capabilities = {
  contacts: true,
  salesInvoices: true,
  purchaseBills: true,
  payments: true,
  attachments: false,
  analytic: false
}

Ton app adapte l'UX.

12️⃣ Architecture finale
apps/backend

services
   accountingSync.service.ts
   accountingMatching.service.ts

connectors
   odoo.connector.ts
   pennylane.connector.ts
   quickbooks.connector.ts
   sage.connector.ts

factory
   accountingConnector.factory.ts
13️⃣ Ce que cela permet

Ton app devient compatible avec :

Odoo
Pennylane
Quickbooks
Sage
EBP
Tiime
Indy
Xero

sans refactor.

14️⃣ Ce qui fera vraiment la différence produit

L’IA pourra analyser :

factures clients
factures fournisseurs
paiements
chantiers
marge
trésorerie
anomalies comptables

ce qu’aucun logiciel comptable ne fait bien pour les artisans.

🚀 Étape suivante recommandée

La prochaine amélioration majeure de ton app serait :

créer le moteur IA financier.

C’est lui qui donnera des insights comme :

⚠️ Marge chantier anormalement basse

⚠️ Fournisseur 23% plus cher que moyenne

⚠️ Client avec 47 jours de retard moyen

⚠️ Trésorerie négative dans 21 jours