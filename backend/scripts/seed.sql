-- =============================================================================
-- Coffee Farm ERP - Seed de dados iniciais (idempotente)
-- =============================================================================
-- UUIDs fixos organizados por módulo (primeiro byte identifica o domínio):
--   11...  users (auth)
--   22...  clients (comercial)
--   33...  suppliers (compras)
--   44...  employees (folha)
--   55...  stock_items (estoque)
--   66...  plots (pcp)
--   77...  production_orders / production_inputs (pcp)
--   88...  purchase_orders / purchase_order_items (compras)
--   99...  sales / sale_items (comercial)
--   aa...  invoices / invoice_items (faturamento)
--   bb...  accounts_receivable (financeiro)
--   cc...  accounts_payable (financeiro)
--   dd...  payroll_periods / payroll_entries (folha)
--   de...  payroll_events (folha)
--   ee...  plot_activities (pcp)
--   ff...  stock_movements (estoque)
--   a0...  financial_movements (financeiro)
--   ab...  notifications
--   b0...  quotations (compras)
--   b1...  quotation_items (compras)
--   b2...  quotation_proposals (compras)
--   b3...  quotation_proposal_items (compras)
--   b4...  supplier_items (compras — catálogo fornecedor↔item)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USERS
-- Senha padrão para admin: admin123
-- Hash gerado com bcrypt (rounds=12)
-- -----------------------------------------------------------------------------
INSERT INTO users (id, username, hashed_password, is_active) VALUES
('11111111-1111-1111-1111-111111111001', 'admin', '$2b$12$Qu/tWbeyYlYlaj/zppVJiu86YgptYIPbe1RRvUnxOlkG3i.DCxxFq', TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. CLIENTS (3 — 1 inadimplente)
-- -----------------------------------------------------------------------------
-- address (legado, texto livre) mantido; os campos estruturados (cep..state)
-- são a fonte da verdade do endereço a partir da Demanda 7. Documentos com DV
-- válido (CPF/CNPJ) para não quebrar a validação do backend (D7).
INSERT INTO clients (id, name, document, email, phone, address, cep, street, number, complement, neighborhood, city, state, is_delinquent, notes) VALUES
('22222222-2222-2222-2222-222222222001', 'Cafeteria Grão Fino Ltda',       '12.345.678/0001-95', 'contato@graofino.com.br',      '(11) 3000-1001',  'Av. Paulista, 1000 - São Paulo/SP',  '01310-100', 'Avenida Paulista',  '1000', 'Conjunto 52', 'Bela Vista', 'São Paulo', 'SP', FALSE, 'Cliente premium, compra café especial'),
('22222222-2222-2222-2222-222222222002', 'Distribuidora Aroma do Cerrado', '98.765.432/0001-98', 'compras@aromacerrado.com.br',  '(62) 3500-2002',  'Rua das Palmeiras, 500 - Goiânia/GO', '74110-010', 'Rua das Palmeiras', '500',  'Galpão B',    'Setor Marista', 'Goiânia', 'GO', FALSE, 'Distribuidora regional'),
('22222222-2222-2222-2222-222222222003', 'Mercearia Dona Rita',            '456.789.123-64',     'donarita@email.com',           '(35) 99800-3003', 'Rua do Centro, 77 - Alfenas/MG',      '37130-000', 'Rua do Centro',     '77',   NULL,          'Centro',        'Alfenas', 'MG', TRUE,  'Inadimplente (conta vencida em aberto)')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. SUPPLIERS (3)
-- -----------------------------------------------------------------------------
-- address (legado, texto livre) mantido; os campos estruturados (cep..state)
-- são a fonte da verdade do endereço a partir da Demanda 6.
INSERT INTO suppliers (id, name, document, email, phone, address, cep, street, number, complement, neighborhood, city, state, notes) VALUES
('33333333-3333-3333-3333-333333333001', 'AgroInsumos do Brasil S.A.',      '55.444.333/0001-00', 'vendas@agroinsumos.com.br',  '(31) 3200-4001', 'Rod. Fernão Dias, KM 500 - Betim/MG',  '32600-000', 'Rodovia Fernão Dias',  'KM 500', 'Galpão 3', 'Distrito Industrial', 'Betim',      'MG', 'Fertilizantes, adubos e pesticidas'),
('33333333-3333-3333-3333-333333333002', 'Fazenda São Pedro Café Verde',    '66.555.444/0001-00', 'comercial@fazendasp.com.br', '(35) 3700-4002', 'Zona Rural - Patrocínio/MG',           '38740-000', 'Rodovia BR-365',       'S/N',    'Fazenda São Pedro', 'Zona Rural',        'Patrocínio', 'MG', 'Café verde para beneficiamento'),
('33333333-3333-3333-3333-333333333003', 'Máquinas Serra Verde Ltda',       '77.666.555/0001-00', 'pecas@serraverde.com.br',    '(35) 3900-4003', 'Av. dos Tratores, 200 - Varginha/MG',  '37026-400', 'Avenida dos Tratores', '200',    'Loja A',    'Industrial JK',      'Varginha',   'MG', 'Máquinas agrícolas e peças')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. JOB POSITIONS (cargos) — entidade referenciada por employees.position_id
--    base_salary = sugestão de salário do cargo (prefilla o do funcionário).
--    Um cargo por funcionário do seed; "Colhedor" e "Colhedora" são distintos.
--
--    IDEMPOTÊNCIA / re-seed: este INSERT usa ids fixos (referenciados por
--    employees.position_id abaixo), então o ON CONFLICT é por (id). Isso NÃO
--    protege contra a constraint UNIQUE(name) (ix_job_positions_name) caso
--    existam linhas com os MESMOS nomes e ids DIFERENTES — exatamente o que a
--    migration 0013_job_positions cria em prod a partir do role legado. A
--    proteção contra essa colisão por NOME é feita LIMPANDO job_positions antes
--    do seed (TABLES_TO_CLEAR em scripts/seed_only.py, após employees; reset_db.py
--    parte de banco vazio). Não trocar o conflito para (name): isso pularia os
--    ids fixos e quebraria a FK employees.position_id.
-- -----------------------------------------------------------------------------
INSERT INTO job_positions (id, name, description, base_salary, is_active) VALUES
('99999999-9999-9999-9999-999999990001', 'Gerente Agrícola',         'Gestão das operações agrícolas da fazenda',          6000.00, TRUE),
('99999999-9999-9999-9999-999999990002', 'Supervisora de Produção',  'Supervisão das equipes de produção',                 3500.00, TRUE),
('99999999-9999-9999-9999-999999990003', 'Operador de Máquinas',     'Operação de máquinas e implementos agrícolas',       2200.00, TRUE),
('99999999-9999-9999-9999-999999990004', 'Consultora de Qualidade',  'Análise e controle de qualidade do café',            5500.00, TRUE),
('99999999-9999-9999-9999-999999990005', 'Mecânico Industrial',      'Manutenção de máquinas e equipamentos',              4000.00, TRUE),
('99999999-9999-9999-9999-999999990006', 'Contabilidade',            'Rotinas contábeis e fiscais',                        4500.00, TRUE),
('99999999-9999-9999-9999-999999990007', 'Colhedor',                 'Colheita de café (safra)',                           1800.00, TRUE),
('99999999-9999-9999-9999-999999990008', 'Colhedora',                'Colheita de café (safra)',                           1800.00, TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4b. EMPLOYEES (8: 3 CLT + 3 PJ + 2 Temp) — cargo via position_id (role legado: NULL)
--     Colunas de benefício/dependentes (Demanda Folha): transport_voucher_cost,
--     meal_voucher_value, pharmacy_voucher_value, life_insurance_value,
--     dependents_count. Exemplos preenchidos nos CLT e temporários.
-- -----------------------------------------------------------------------------
INSERT INTO employees (
  id, name, document, email, phone, position_id, contract_type, base_salary, hire_date,
  transport_voucher_cost, meal_voucher_value, pharmacy_voucher_value,
  life_insurance_value, dependents_count, is_active
) VALUES
('44444444-4444-4444-4444-444444444001', 'João Silva',        '111.222.333-01', 'joao.silva@fazenda.com',     '(35) 98100-0001', '99999999-9999-9999-9999-999999990001', 'clt',         6000.00, '2020-03-01', 320.00, 650.00,  80.00, 45.00, 2, TRUE),
('44444444-4444-4444-4444-444444444002', 'Maria Santos',      '111.222.333-02', 'maria.santos@fazenda.com',   '(35) 98100-0002', '99999999-9999-9999-9999-999999990002', 'clt',         3500.00, '2021-06-15', 280.00, 500.00,   NULL, 45.00, 1, TRUE),
('44444444-4444-4444-4444-444444444003', 'Carlos Oliveira',   '111.222.333-03', 'carlos.oliveira@fazenda.com','(35) 98100-0003', '99999999-9999-9999-9999-999999990003', 'clt',         2200.00, '2022-09-10', 220.00, 420.00,   NULL, 35.00, 0, TRUE),
('44444444-4444-4444-4444-444444444004', 'Ana Pereira',       '111.222.333-04', 'ana.pereira@consult.com',    '(11) 98100-0004', '99999999-9999-9999-9999-999999990004', 'pj',          5500.00, '2023-02-01', NULL,   NULL,     NULL, NULL,  0, TRUE),
('44444444-4444-4444-4444-444444444005', 'Pedro Costa',       '111.222.333-05', 'pedro.costa@pj.com',         '(35) 98100-0005', '99999999-9999-9999-9999-999999990005', 'pj',          4000.00, '2023-08-15', NULL,   NULL,     NULL, NULL,  0, TRUE),
('44444444-4444-4444-4444-444444444006', 'Lucas Rodrigues',   '111.222.333-06', 'lucas@contabil.com',         '(35) 98100-0006', '99999999-9999-9999-9999-999999990006', 'pj',          4500.00, '2022-01-10', NULL,   NULL,     NULL, NULL,  1, TRUE),
('44444444-4444-4444-4444-444444444007', 'Rafael Almeida',    '111.222.333-07', 'rafael.almeida@fazenda.com', '(35) 98100-0007', '99999999-9999-9999-9999-999999990007', 'temporario',  1800.00, (CURRENT_DATE - INTERVAL '5 months'), 180.00, 350.00,   NULL, NULL,  0, TRUE),
('44444444-4444-4444-4444-444444444008', 'Sofia Lima',        '111.222.333-08', 'sofia.lima@fazenda.com',     '(35) 98100-0008', '99999999-9999-9999-9999-999999990008', 'temporario',  1800.00, (CURRENT_DATE - INTERVAL '5 months'), 180.00, 350.00,   NULL, NULL,  0, TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. PAYROLL EVENTS (catalogo de eventos padrao da folha)
-- -----------------------------------------------------------------------------
INSERT INTO payroll_events (
  id, description, event_type, calculation_type, is_automatic, affects_net, is_active
) VALUES
('dededede-dede-dede-dede-dededede0001', 'Salario base',      'provento',    'manual',            FALSE, TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0002', 'Hora extra',        'provento',    'overtime',          TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0003', 'Adicional noturno', 'provento',    'night_shift',       TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0004', 'INSS',              'desconto',    'inss',              TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0005', 'Vale transporte',   'desconto',    'transport_voucher', TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0006', 'FGTS',              'informativo', 'fgts',              TRUE,  FALSE, TRUE),
('dededede-dede-dede-dede-dededede0007', 'Descontos manuais', 'desconto',    'manual',            FALSE, TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0008', 'Vale refeição',     'informativo', 'manual',            FALSE, FALSE, TRUE),
('dededede-dede-dede-dede-dededede0009', 'Vale farmácia',     'informativo', 'manual',            FALSE, FALSE, TRUE),
('dededede-dede-dede-dede-dededede0010', 'Seguro de vida',    'informativo', 'manual',            FALSE, FALSE, TRUE),
('dededede-dede-dede-dede-dededede0011', 'IRRF',              'desconto',    'irrf',              TRUE,  TRUE,  TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5b. STOCK CATEGORIES (categorias configuráveis — D2) + papéis de sistema (D3)
--     Ids fixos espelham a migration 0015 (referenciados por stock_items.category_id).
-- -----------------------------------------------------------------------------
INSERT INTO stock_categories (id, name, description, is_active) VALUES
('66666666-6666-6666-6666-666666660001', 'Café',        'Café em sacas (produto final/vendável)', TRUE),
('66666666-6666-6666-6666-666666660002', 'Insumo',      'Fertilizantes, defensivos e correções',  TRUE),
('66666666-6666-6666-6666-666666660003', 'Veículo',     'Veículos e tratores',                    TRUE),
('66666666-6666-6666-6666-666666660004', 'Equipamento', 'Máquinas e equipamentos',                TRUE),
('66666666-6666-6666-6666-666666660005', 'Outro',       'Itens diversos / refugo',                TRUE),
('66666666-6666-6666-6666-666666660006', 'Embalagem',   'Sacarias e embalagens de café',          TRUE)
ON CONFLICT (id) DO NOTHING;

-- Papéis de sistema por categoria (M:N). Café tem DOIS papéis. "Outro" recebe
-- produto_descartado (demo) para hospedar o item-destino de Descarte da colheita.
INSERT INTO category_role_assignments (id, category_id, role) VALUES
('77777777-7777-7777-7777-777777770001', '66666666-6666-6666-6666-666666660001', 'produto_final'),
('77777777-7777-7777-7777-777777770002', '66666666-6666-6666-6666-666666660001', 'produto_vendavel'),
('77777777-7777-7777-7777-777777770003', '66666666-6666-6666-6666-666666660002', 'insumo'),
('77777777-7777-7777-7777-777777770004', '66666666-6666-6666-6666-666666660003', 'veiculo'),
('77777777-7777-7777-7777-777777770005', '66666666-6666-6666-6666-666666660004', 'maquina'),
('77777777-7777-7777-7777-777777770006', '66666666-6666-6666-6666-666666660005', 'produto_descartado'),
('77777777-7777-7777-7777-777777770007', '66666666-6666-6666-6666-666666660006', 'embalagem')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. STOCK ITEMS (3 cafés + 4 insumos + 2 equipamentos + 1 descarte + 1 embalagem = 11)
-- quantity_on_hand reflete o estado pós produção/compra já representado no seed.
-- Categoria via category_id (enum `category` legado fica NULL).
-- -----------------------------------------------------------------------------
INSERT INTO stock_items (id, sku, name, category_id, unit, minimum_stock, unit_cost, quantity_on_hand, description) VALUES
-- Cafés (sacas de 60kg) → categoria Café
('55555555-5555-5555-5555-555555555001', 'CAFE-ESP', 'Café Arábica Especial (saca 60kg)',   '66666666-6666-6666-6666-666666660001', 'saca',    10.000, 900.00,   9.000,   'Café especial, pontuação SCA 85+'),
('55555555-5555-5555-5555-555555555002', 'CAFE-SUP', 'Café Arábica Superior (saca 60kg)',   '66666666-6666-6666-6666-666666660001', 'saca',    20.000, 650.00,  17.000,   'Café superior, SCA 80-84'),
('55555555-5555-5555-5555-555555555003', 'CAFE-TRA', 'Café Arábica Tradicional (saca 60kg)','66666666-6666-6666-6666-666666660001', 'saca',    20.000, 450.00,   5.000,   'Café tradicional, SCA <80'),
-- Insumos → categoria Insumo
('55555555-5555-5555-5555-555555555011', 'INS-FERT', 'Fertilizante NPK 20-05-20',           '66666666-6666-6666-6666-666666660002', 'kg',     100.000,  12.00, 500.000,   'Fertilizante granulado para cafeeiro'),
('55555555-5555-5555-5555-555555555012', 'INS-ADUB', 'Adubo Orgânico',                      '66666666-6666-6666-6666-666666660002', 'kg',     100.000,   8.00, 200.000,   'Adubo composto orgânico'),
('55555555-5555-5555-5555-555555555013', 'INS-PEST', 'Pesticida Fungicida',                 '66666666-6666-6666-6666-666666660002', 'litro',   20.000,  25.00,  15.000,   'Fungicida de contato - abaixo do mínimo'),
('55555555-5555-5555-5555-555555555014', 'INS-CALC', 'Calcário Dolomítico',                 '66666666-6666-6666-6666-666666660002', 'kg',     200.000,   3.00, 300.000,   'Correção de acidez do solo'),
-- Veículo / Equipamento
('55555555-5555-5555-5555-555555555021', 'EQP-TRA01', 'Trator New Holland T6',              '66666666-6666-6666-6666-666666660003', 'unidade',  1.000, 185000.00, 1.000,  'Trator 140cv com implementos'),
('55555555-5555-5555-5555-555555555022', 'EQP-COL01', 'Colheitadeira Jacto Máster',         '66666666-6666-6666-6666-666666660004', 'unidade',  1.000, 250000.00, 1.000,  'Colheitadeira automotriz para café'),
-- Item-destino de Descarte da colheita (categoria Outro → produto_descartado)
('55555555-5555-5555-5555-555555555031', 'CAFE-DESC', 'Café Descarte (refugo)',             '66666666-6666-6666-6666-666666660005', 'saca',     0.000,   0.00,   0.000,   'Café descartado (refugo da colheita)'),
-- Embalagem (sacaria) → categoria Embalagem (papel `embalagem`), consumo por OP
('55555555-5555-5555-5555-555555555041', 'EMB-SC60', 'Saca de Polipropileno 60kg',          '66666666-6666-6666-6666-666666660006', 'unidade', 50.000,    5.00, 1000.000,  'Sacaria para ensaque do café (embalagem)')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6b. APP SETTINGS (key-value de configuração)
--   - itens-destino da colheita (D1)
--   - taxas de encargo por atraso (D9.B): multa unica (porcentagem) + juros de
--     mora ao mes (porcentagem), lidas pelo Backend na baixa de parcela vencida
--     (defaults 2/1 se ausentes).
-- -----------------------------------------------------------------------------
INSERT INTO app_settings (id, key, value) VALUES
('88888888-8888-8888-8888-888888880001', 'harvest_destination_industria_item_id', '55555555-5555-5555-5555-555555555002'),
('88888888-8888-8888-8888-888888880002', 'harvest_destination_embalagem_item_id', '55555555-5555-5555-5555-555555555001'),
('88888888-8888-8888-8888-888888880003', 'harvest_destination_descarte_item_id',  '55555555-5555-5555-5555-555555555031'),
('88888888-8888-8888-8888-888888880004', 'multa_atraso_percent',                  '2'),
('88888888-8888-8888-8888-888888880005', 'juros_mora_mensal_percent',             '1'),
-- Emitente da fazenda (D11.1): dados exibidos no cabeçalho da NF de venda.
('88888888-8888-8888-8888-888888880006', 'emitter_legal_name',          'Fazenda Santa Esperança Café Ltda'),
('88888888-8888-8888-8888-888888880007', 'emitter_trade_name',          'Café Santa Esperança'),
('88888888-8888-8888-8888-888888880008', 'emitter_cnpj',                '12.345.678/0001-90'),
('88888888-8888-8888-8888-888888880009', 'emitter_state_registration',  '062.307.831.0500'),
('88888888-8888-8888-8888-888888880010', 'emitter_cep',                 '35400-000'),
('88888888-8888-8888-8888-888888880011', 'emitter_street',              'Rodovia MG-187, km 12'),
('88888888-8888-8888-8888-888888880012', 'emitter_number',              's/n'),
('88888888-8888-8888-8888-888888880013', 'emitter_complement',          'Zona Rural'),
('88888888-8888-8888-8888-888888880014', 'emitter_neighborhood',        'Distrito de São Bartolomeu'),
('88888888-8888-8888-8888-888888880015', 'emitter_city',                'Ouro Preto'),
('88888888-8888-8888-8888-888888880016', 'emitter_state',               'MG'),
('88888888-8888-8888-8888-888888880017', 'emitter_phone',               '(31) 3551-7788'),
('88888888-8888-8888-8888-888888880018', 'emitter_email',               'contato@cafesantaesperanca.com.br'),
-- Impostos / alíquotas fiscais (D11.2): defaults = valores antes hardcoded no front.
('88888888-8888-8888-8888-888888880019', 'icms_percent',                '12'),
('88888888-8888-8888-8888-888888880020', 'pis_percent',                 '0.65'),
('88888888-8888-8888-8888-888888880021', 'cofins_percent',              '3'),
('88888888-8888-8888-8888-888888880022', 'ipi_percent',                 '0')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6c. SUPPLIER ITEMS (catálogo fornecedor ↔ item de estoque, com preço)
-- Sem quantidade (estoque do fornecedor = infinito). Preços coerentes com o
-- unit_cost dos itens. NUNCA itens de descarte/refugo (não são vendáveis).
-- COBERTURA CRÍTICA: todo item de ordem de compra de PRODUTO do seed precisa
-- estar no catálogo do fornecedor daquela ordem (senão o Backend invalidaria a
-- ordem). As ordens de produto do seed são do fornecedor 33...3001 (AgroInsumos)
-- e usam os itens INS-FERT (5011), INS-ADUB (5012) e INS-PEST (5013) — todos
-- presentes abaixo no catálogo da AgroInsumos.
-- -----------------------------------------------------------------------------
INSERT INTO supplier_items (id, supplier_id, stock_item_id, unit_price, is_active) VALUES
-- AgroInsumos do Brasil S.A. (insumos) — cobre todas as ordens de produto do seed
('b4000000-0000-0000-0000-b40000000001', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555011',     11.50, TRUE),  -- Fertilizante NPK
('b4000000-0000-0000-0000-b40000000002', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555012',      7.80, TRUE),  -- Adubo Orgânico
('b4000000-0000-0000-0000-b40000000003', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555013',     24.00, TRUE),  -- Pesticida Fungicida
('b4000000-0000-0000-0000-b40000000004', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555014',      3.20, TRUE),  -- Calcário Dolomítico
('b4000000-0000-0000-0000-b40000000005', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555041',      4.80, TRUE),  -- Saca de Polipropileno 60kg
-- Fazenda São Pedro Café Verde (cafés verdes para beneficiamento)
('b4000000-0000-0000-0000-b40000000011', '33333333-3333-3333-3333-333333333002', '55555555-5555-5555-5555-555555555001',    880.00, TRUE),  -- Café Especial
('b4000000-0000-0000-0000-b40000000012', '33333333-3333-3333-3333-333333333002', '55555555-5555-5555-5555-555555555002',    640.00, TRUE),  -- Café Superior
('b4000000-0000-0000-0000-b40000000013', '33333333-3333-3333-3333-333333333002', '55555555-5555-5555-5555-555555555003',    440.00, TRUE),  -- Café Tradicional
-- Máquinas Serra Verde Ltda (máquinas/equipamentos)
('b4000000-0000-0000-0000-b40000000021', '33333333-3333-3333-3333-333333333003', '55555555-5555-5555-5555-555555555021', 182000.00, TRUE),  -- Trator New Holland T6
('b4000000-0000-0000-0000-b40000000022', '33333333-3333-3333-3333-333333333003', '55555555-5555-5555-5555-555555555022', 248000.00, TRUE)   -- Colheitadeira Jacto Máster
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. PLOTS (2)
-- -----------------------------------------------------------------------------
INSERT INTO plots (id, name, location, variety, capacity_sacas, total_hectares, notes) VALUES
('66666666-6666-6666-6666-666666666001', 'Talhão A - Bourbon Amarelo',  'Setor Norte, 12 ha', 'Arábica Bourbon Amarelo', 100.000, 12.00, 'Maior altitude, café especial'),
('66666666-6666-6666-6666-666666666002', 'Talhão B - Catuaí Vermelho',  'Setor Sul, 18 ha',   'Arábica Catuaí Vermelho', 150.000, 18.00, 'Produção tradicional alta')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. PURCHASE ORDERS (concluídas + uma em conferência)
-- Datas ancoradas em CURRENT_DATE (seed sempre "fresco"). Ordem 88...8801:
-- 500kg fertilizante + 200kg adubo = R$ 7.600 (concluída, ~4 meses atrás).
-- Ordem 88...8803: trator (R$ 182.000, concluída ~5 meses atrás — entrada inicial
-- do equipamento). Ordem 88...8804: sacaria + calcário em conferência (recente).
-- -----------------------------------------------------------------------------
INSERT INTO purchase_orders (id, supplier_id, status, total_amount, receipt_total_amount, ordered_at, received_at, notes, order_type, installments, first_due_date, installment_interval_days, payment_method) VALUES
('88888888-8888-8888-8888-888888888001', '33333333-3333-3333-3333-333333333001', 'concluida', 7600.00, 7600.00, (CURRENT_DATE - INTERVAL '135 days')::timestamptz + INTERVAL '9 hours', (CURRENT_DATE - INTERVAL '131 days')::timestamptz + INTERVAL '14 hours', 'Reabastecimento de fertilizante e adubo', 'produto', 1, NULL, 30, 'a_vista'),
('88888888-8888-8888-8888-888888888003', '33333333-3333-3333-3333-333333333003', 'concluida', 182000.00, 182000.00, (CURRENT_DATE - INTERVAL '160 days')::timestamptz + INTERVAL '9 hours', (CURRENT_DATE - INTERVAL '155 days')::timestamptz + INTERVAL '14 hours', 'Aquisição do trator New Holland T6', 'produto', 4, NULL, 30, 'parcelado'),
('88888888-8888-8888-8888-888888888004', '33333333-3333-3333-3333-333333333001', 'em_conferencia', 1660.00, 0.00, (CURRENT_DATE - INTERVAL '6 days')::timestamptz + INTERVAL '10 hours', NULL, 'Sacaria e calcário em conferência de recebimento', 'produto', 1, NULL, 30, 'a_vista')
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_order_items (id, purchase_order_id, stock_item_id, description, quantity, unit_price, subtotal) VALUES
('88888888-8888-8888-8888-888888888011', '88888888-8888-8888-8888-888888888001', '55555555-5555-5555-5555-555555555011', 'Fertilizante NPK 500kg', 500.000, 12.00, 6000.00),
('88888888-8888-8888-8888-888888888012', '88888888-8888-8888-8888-888888888001', '55555555-5555-5555-5555-555555555012', 'Adubo Orgânico 200kg',   200.000,  8.00, 1600.00),
-- Ordem do trator (concluída)
('88888888-8888-8888-8888-888888888031', '88888888-8888-8888-8888-888888888003', '55555555-5555-5555-5555-555555555021', 'Trator New Holland T6', 1.000, 182000.00, 182000.00),
-- Ordem em conferência: 200 sacas + 200kg calcário = 1.660,00
('88888888-8888-8888-8888-888888888041', '88888888-8888-8888-8888-888888888004', '55555555-5555-5555-5555-555555555041', 'Saca de Polipropileno 60kg', 200.000, 4.80, 960.00),
('88888888-8888-8888-8888-888888888042', '88888888-8888-8888-8888-888888888004', '55555555-5555-5555-5555-555555555014', 'Calcário Dolomítico 200kg',  200.000, 3.20,  640.00)
ON CONFLICT (id) DO NOTHING;

-- Conferência de recebimento da ordem 88...8804 (em_conferencia → itens pendentes).
INSERT INTO purchase_order_receipts (id, purchase_order_id, purchase_order_item_id, quantity_ordered, quantity_accepted, quantity_rejected, rejection_reason, status) VALUES
('88888888-8888-8888-8888-888888888051', '88888888-8888-8888-8888-888888888004', '88888888-8888-8888-8888-888888888041', 200.000, 0.000, 0.000, NULL, 'pendente'),
('88888888-8888-8888-8888-888888888052', '88888888-8888-8888-8888-888888888004', '88888888-8888-8888-8888-888888888042', 200.000, 0.000, 0.000, NULL, 'pendente')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. PRODUCTION ORDER (1 concluída) - Talhão A, safra atual
-- Usa 10 ha dos 12 ha do talhão A. Total 100 sacas por destino:
--   19 indústria + 52 embalagem + 29 descarte, custo R$ 8.500
-- (mapeamento herdado da qualidade antiga: especial→indústria, superior→embalagem,
--  tradicional→descarte). Os itens-destino são definidos em app_settings (D1).
-- -----------------------------------------------------------------------------
INSERT INTO production_orders (id, plot_id, order_number, start_date, expected_end_date, executed_at, hectares_used, total_sacas, industria_sacas, embalagem_sacas, descarte_sacas, total_cost, status, harvest_progress, notes) VALUES
('77777777-7777-7777-7777-777777777001', '66666666-6666-6666-6666-666666666001', 'OP-0001', (CURRENT_DATE - INTERVAL '226 days'), (CURRENT_DATE - INTERVAL '156 days'), (CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '8 hours', 10.00, 100.000, 19.000, 52.000, 29.000, 8500.00, 'concluida', 100.00, 'Safra atual - talhão A (concluída 100%%)'),
-- Segunda OP em execução parcial no talhão B (mostra colheita parcial em andamento).
('77777777-7777-7777-7777-777777777002', '66666666-6666-6666-6666-666666666002', 'OP-0002', (CURRENT_DATE - INTERVAL '40 days'), (CURRENT_DATE + INTERVAL '20 days'), NULL, 12.00, 48.000, 9.000, 27.000, 12.000, 3960.00, 'em_execucao', 40.00, 'Safra atual - talhão B (colheita parcial 40%%)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO production_inputs (id, production_order_id, stock_item_id, quantity, unit_cost, subtotal) VALUES
('77777777-7777-7777-7777-777777777011', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555011', 400.000, 12.00, 4800.00),
('77777777-7777-7777-7777-777777777012', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555012', 150.000,  8.00, 1200.00),
('77777777-7777-7777-7777-777777777013', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555013', 100.000, 25.00, 2500.00),
-- Insumos consumidos na OP-0002 (parcial): 100kg NPK + 50kg adubo + 14kg calcário
('77777777-7777-7777-7777-777777777014', '77777777-7777-7777-7777-777777777002', '55555555-5555-5555-5555-555555555011', 100.000, 12.00, 1200.00),
('77777777-7777-7777-7777-777777777015', '77777777-7777-7777-7777-777777777002', '55555555-5555-5555-5555-555555555012',  50.000,  8.00,  400.00)
ON CONFLICT (id) DO NOTHING;

-- Colheita parcial registrada da OP-0002 (1a rodada, 40%%).
INSERT INTO production_harvests (id, production_order_id, harvest_number, percentage_harvested, hectares_harvested, sacks_total, sacks_industria, sacks_embalagem, sacks_descarte, is_final, harvested_at) VALUES
('77777777-7777-7777-7777-777777777091', '77777777-7777-7777-7777-777777777002', 1, 40.00, 4.80, 48.00, 9.00, 27.00, 12.00, FALSE, (CURRENT_DATE - INTERVAL '8 days')::timestamptz + INTERVAL '10 hours')
ON CONFLICT (id) DO NOTHING;

-- Requisitos de mão de obra por CARGO (substitui a alocação nominal de funcionários):
-- 1 Supervisora de Produção (CLT) + 2 Operadores de Máquinas (CLT) + 5 Colhedores (temporário).
INSERT INTO production_order_position_requirements (id, production_order_id, position_id, quantity, contract_type) VALUES
('77777777-7777-7777-7777-777777777021', '77777777-7777-7777-7777-777777777001', '99999999-9999-9999-9999-999999990002', 1, 'clt'),
('77777777-7777-7777-7777-777777777022', '77777777-7777-7777-7777-777777777001', '99999999-9999-9999-9999-999999990003', 2, 'clt'),
('77777777-7777-7777-7777-777777777023', '77777777-7777-7777-7777-777777777001', '99999999-9999-9999-9999-999999990007', 5, 'temporario'),
-- OP-0002: 1 supervisora + 3 colhedoras temporárias
('77777777-7777-7777-7777-777777777024', '77777777-7777-7777-7777-777777777002', '99999999-9999-9999-9999-999999990002', 1, 'clt'),
('77777777-7777-7777-7777-777777777025', '77777777-7777-7777-7777-777777777002', '99999999-9999-9999-9999-999999990008', 3, 'temporario')
ON CONFLICT (id) DO NOTHING;

-- Recursos de estoque da OP: 1 colheitadeira (papel `maquina`, reservada) com 8h
-- de uso acumuladas → custo = horas × stock_item.hourly_cost (regra no Backend).
INSERT INTO production_order_resources (id, production_order_id, stock_item_id, resource_role, quantity, accumulated_hours) VALUES
('77777777-7777-7777-7777-777777777041', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555022', 'maquina', NULL, 8.00)
ON CONFLICT (id) DO NOTHING;

-- Serviço externo contratado (colheita mecanizada terceirizada).
-- accounts_payable_id = NULL: ordem já concluída, dado apenas para teste visual.
INSERT INTO production_order_services (id, production_order_id, supplier_id, description, amount, due_date, accounts_payable_id) VALUES
('77777777-7777-7777-7777-777777777031', '77777777-7777-7777-7777-777777777001', '33333333-3333-3333-3333-333333333003', 'Colheita mecanizada terceirizada - talhão A', 3500.00, (CURRENT_DATE - INTERVAL '156 days'), NULL)
ON CONFLICT (id) DO NOTHING;

-- Atividades no talhão (datas relativas a CURRENT_DATE)
INSERT INTO plot_activities (id, plot_id, activity_type, activity_date, labor_type, cost, details) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', '66666666-6666-6666-6666-666666666001', 'adubacao', (CURRENT_DATE - INTERVAL '217 days'), 'interna', 0.00,    'Adubação de cobertura, mão de obra própria'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', '66666666-6666-6666-6666-666666666001', 'colheita', (CURRENT_DATE - INTERVAL '166 days'), 'externa', 3500.00, 'Colheita manual com equipe terceirizada'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0003', '66666666-6666-6666-6666-666666666002', 'plantio',  (CURRENT_DATE - INTERVAL '268 days'), 'interna', 0.00,    'Plantio de mudas Catuaí Vermelho'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0004', '66666666-6666-6666-6666-666666666002', 'colheita', (CURRENT_DATE - INTERVAL '8 days'),   'interna', 0.00,    'Colheita parcial (40%%) do talhão B - OP-0002')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. SALES (9) — massa de demonstracao do Relatorio de Vendas (Demanda 10)
-- Vendas 1-4: base original (D9). Vendas 5-9: adicionadas na D10 para o relatorio
-- ter o que mostrar (serie temporal, mix de status, mix a vista x parcelado, top
-- produtos e top clientes). Periodo via sold_at: cobre ~5 meses (relativo a CURRENT_DATE).
--
-- Venda 1: Cliente 1, 10 especial + 20 superior = R$ 22.000 (entregue, à vista)   [~4 meses atras]
-- Venda 2: Cliente 2, 15 superior + 30 tradicional = R$ 23.250 (realizada, à vista) [~3 meses atras]
-- Venda 3: Cliente 1, 5 superior = R$ 3.000 (realizada, PARCELADA 3x)             [~2 meses atras]
--   Modelo D9.0: venda parcelada = 1 nota (total cheio) + N accounts_receivable
--   (parcelas). As 3 parcelas vivem na AR, todas apontando para a NF-0003.
-- Venda 4: Cliente 2, 20 superior = subtotal R$ 12.000 com desconto de cabecalho  [~2 meses atras]
--   de 10 (discount_percent=10,00 / discount_amount=1.200,00) => total LIQUIDO
--   R$ 10.800 (realizada, a vista, em aberto). Modelo D9.C: preco de tabela do
--   item intacto; o desconto vive no cabecalho e total_amount ja e o liquido.
-- Venda 5: Cliente 1, 8 especial = R$ 8.000 (entregue, à vista, QUITADA)          [~5 meses atras]
-- Venda 6: Cliente 3, 10 tradicional = R$ 4.500 (CANCELADA — fora dos totais)     [~5 meses atras]
-- Venda 7: Cliente 2, 25 superior = R$ 16.250 (realizada, PARCELADA 2x)           [~1 mes atras]
--   parcela 1 quitada (recebida no periodo), parcela 2 em aberto A VENCER.
-- Venda 8: Cliente 1, 12 especial + 8 tradicional = R$ 15.600 (entregue, QUITADA) [~1 mes atras]
-- Venda 9: Cliente 3 (inadimplente), 6 tradicional = R$ 2.700 (realizada, à vista)[~3 meses atras]
--   AR VENCIDA e nao recebida -> inadimplencia em R$ (aging) da Dona Rita.
-- -----------------------------------------------------------------------------
-- DATAS RELATIVAS A CURRENT_DATE: sold_at espalhado nos últimos ~5 meses; o
-- relatório de vendas (D10) continua com série temporal, mix de status e de
-- pagamento. first_due_date das parceladas é relativo (uma a vencer no futuro).
INSERT INTO sales (id, client_id, status, total_amount, discount_percent, discount_amount, sold_at, delivered_at, notes, installments, first_due_date, installment_interval_days, payment_method) VALUES
('99999999-9999-9999-9999-999999999001', '22222222-2222-2222-2222-222222222001', 'entregue',  22000.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '115 days')::timestamptz + INTERVAL '10 hours', (CURRENT_DATE - INTERVAL '113 days')::timestamptz + INTERVAL '15 hours', 'Venda entregue e paga',                1, NULL,                          30, 'a_vista'),
('99999999-9999-9999-9999-999999999002', '22222222-2222-2222-2222-222222222002', 'realizada', 23250.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '92 days')::timestamptz + INTERVAL '11 hours',  NULL,                                                                    'Venda em aberto, aguardando pagamento', 1, NULL,                          30, 'a_vista'),
('99999999-9999-9999-9999-999999999003', '22222222-2222-2222-2222-222222222001', 'realizada',  3000.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '66 days')::timestamptz + INTERVAL '9 hours',   NULL,                                                                    'Venda parcelada 3x (1 nota + 3 parcelas)', 3, (CURRENT_DATE - INTERVAL '36 days'), 30, 'parcelado'),
('99999999-9999-9999-9999-999999999004', '22222222-2222-2222-2222-222222222002', 'realizada', 10800.00, 10.00, 1200.00, (CURRENT_DATE - INTERVAL '51 days')::timestamptz + INTERVAL '14 hours',  NULL,                                                                    'Venda com desconto de cabecalho (subtotal 12.000 menos 10 = liquido 10.800)', 1, NULL, 30, 'a_vista'),
('99999999-9999-9999-9999-999999999005', '22222222-2222-2222-2222-222222222001', 'entregue',   8000.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '148 days')::timestamptz + INTERVAL '10 hours', (CURRENT_DATE - INTERVAL '146 days')::timestamptz + INTERVAL '16 hours', 'Venda entregue e paga (a vista)',       1, NULL,                          30, 'a_vista'),
('99999999-9999-9999-9999-999999999006', '22222222-2222-2222-2222-222222222003', 'cancelada',  4500.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '136 days')::timestamptz + INTERVAL '9 hours',  NULL,                                                                    'Venda cancelada antes do faturamento efetivo', 1, NULL,                 30, 'a_vista'),
('99999999-9999-9999-9999-999999999007', '22222222-2222-2222-2222-222222222002', 'realizada', 16250.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '38 days')::timestamptz + INTERVAL '11 hours',  NULL,                                                                    'Venda parcelada 2x (1 nota + 2 parcelas)', 2, (CURRENT_DATE - INTERVAL '25 days'), 30, 'parcelado'),
('99999999-9999-9999-9999-999999999008', '22222222-2222-2222-2222-222222222001', 'entregue',  15600.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '24 days')::timestamptz + INTERVAL '15 hours',  (CURRENT_DATE - INTERVAL '22 days')::timestamptz + INTERVAL '10 hours',  'Venda entregue e paga (2 produtos)',    1, NULL,                          30, 'a_vista'),
('99999999-9999-9999-9999-999999999009', '22222222-2222-2222-2222-222222222003', 'realizada',  2700.00,  0.00,    0.00, (CURRENT_DATE - INTERVAL '79 days')::timestamptz + INTERVAL '14 hours',  NULL,                                                                    'Venda a vista em aberto, vencida (inadimplencia)', 1, NULL,             30, 'a_vista')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sale_items (id, sale_id, stock_item_id, description, quantity, unit_price, subtotal) VALUES
('99999999-9999-9999-9999-999999999011', '99999999-9999-9999-9999-999999999001', '55555555-5555-5555-5555-555555555001', 'Café Especial - 10 sacas',    10.000, 1000.00, 10000.00),
('99999999-9999-9999-9999-999999999012', '99999999-9999-9999-9999-999999999001', '55555555-5555-5555-5555-555555555002', 'Café Superior - 20 sacas',    20.000,  600.00, 12000.00),
('99999999-9999-9999-9999-999999999021', '99999999-9999-9999-9999-999999999002', '55555555-5555-5555-5555-555555555002', 'Café Superior - 15 sacas',    15.000,  650.00,  9750.00),
('99999999-9999-9999-9999-999999999022', '99999999-9999-9999-9999-999999999002', '55555555-5555-5555-5555-555555555003', 'Café Tradicional - 30 sacas', 30.000,  450.00, 13500.00),
('99999999-9999-9999-9999-999999999031', '99999999-9999-9999-9999-999999999003', '55555555-5555-5555-5555-555555555002', 'Café Superior - 5 sacas',      5.000,  600.00,  3000.00),
-- Venda 4: item ao preco de tabela (subtotal cheio 12.000). O desconto de 10 e de
-- cabecalho (cabecalho da venda/nota), nao altera o subtotal do item.
('99999999-9999-9999-9999-999999999041', '99999999-9999-9999-9999-999999999004', '55555555-5555-5555-5555-555555555002', 'Café Superior - 20 sacas',    20.000,  600.00, 12000.00),
-- Vendas 5-9 (D10): itens variados cobrindo os 3 cafes (especial/superior/tradicional)
('99999999-9999-9999-9999-999999999051', '99999999-9999-9999-9999-999999999005', '55555555-5555-5555-5555-555555555001', 'Café Especial - 8 sacas',      8.000, 1000.00,  8000.00),
('99999999-9999-9999-9999-999999999061', '99999999-9999-9999-9999-999999999006', '55555555-5555-5555-5555-555555555003', 'Café Tradicional - 10 sacas', 10.000,  450.00,  4500.00),
('99999999-9999-9999-9999-999999999071', '99999999-9999-9999-9999-999999999007', '55555555-5555-5555-5555-555555555002', 'Café Superior - 25 sacas',    25.000,  650.00, 16250.00),
('99999999-9999-9999-9999-999999999081', '99999999-9999-9999-9999-999999999008', '55555555-5555-5555-5555-555555555001', 'Café Especial - 12 sacas',    12.000, 1000.00, 12000.00),
('99999999-9999-9999-9999-999999999082', '99999999-9999-9999-9999-999999999008', '55555555-5555-5555-5555-555555555003', 'Café Tradicional - 8 sacas',   8.000,  450.00,  3600.00),
('99999999-9999-9999-9999-999999999091', '99999999-9999-9999-9999-999999999009', '55555555-5555-5555-5555-555555555003', 'Café Tradicional - 6 sacas',   6.000,  450.00,  2700.00)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. INVOICES (9) - UMA nota por venda (inclusive a parcelada: 1 nota, total cheio)
-- NF-0003 cobre a venda parcelada 3x: total cheio R$ 3.000, status 'emitida' (nem
-- todas as parcelas quitadas), itens UMA vez. installment_*/parent_invoice_id ficam
-- NULL no fluxo de venda — a parcela vive na accounts_receivable (modelo D9.0).
-- NF-0004 cobre a venda com desconto de cabecalho: itens ao preco de tabela (soma
-- 12.000) e total_amount = LIQUIDO 10.800. Enquanto a invoice nao tem coluna de
-- desconto propria (passo Backend da D9.C), o desconto fica explicado nas notes.
-- NF-0005..0009 (D10): uma nota por venda nova. NF-0006 'cancelada' (Venda 6
-- cancelada); NF-0005/0008 'paga' (a vista quitadas); NF-0007/0009 'emitida'.
-- -----------------------------------------------------------------------------
-- DATAS RELATIVAS: issue_date = data da venda; due_date escalonada (algumas já
-- vencidas, outras a vencer). Status coerente com a AR (paga = todas AR recebidas).
INSERT INTO invoices (id, number, client_id, sale_id, issue_date, due_date, total_amount, status, notes) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'NF-0001', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999001', (CURRENT_DATE - INTERVAL '115 days'), (CURRENT_DATE - INTERVAL '110 days'), 22000.00, 'paga',      'Fatura paga'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'NF-0002', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999002', (CURRENT_DATE - INTERVAL '92 days'),  (CURRENT_DATE - INTERVAL '62 days'),  23250.00, 'emitida',   'Aguardando recebimento (vencida)'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'NF-0003', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999003', (CURRENT_DATE - INTERVAL '66 days'),  (CURRENT_DATE - INTERVAL '36 days'),   3000.00, 'emitida',   'Venda parcelada 3x - bloco de parcelas na AR (AR-0004/0005/0006)'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', 'NF-0004', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999004', (CURRENT_DATE - INTERVAL '51 days'),  (CURRENT_DATE - INTERVAL '21 days'),  10800.00, 'emitida',   'Venda com desconto: subtotal R$ 12.000,00 menos desconto 10%% (R$ 1.200,00) = liquido R$ 10.800,00'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005', 'NF-0005', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999005', (CURRENT_DATE - INTERVAL '148 days'), (CURRENT_DATE - INTERVAL '146 days'),  8000.00, 'paga',      'Fatura paga'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', 'NF-0006', '22222222-2222-2222-2222-222222222003', '99999999-9999-9999-9999-999999999006', (CURRENT_DATE - INTERVAL '136 days'), (CURRENT_DATE - INTERVAL '134 days'),  4500.00, 'cancelada', 'Nota cancelada junto com a venda'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', 'NF-0007', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999007', (CURRENT_DATE - INTERVAL '38 days'),  (CURRENT_DATE - INTERVAL '25 days'),  16250.00, 'emitida',   'Venda parcelada 2x - bloco de parcelas na AR (AR-0010/0011)'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0008', 'NF-0008', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999008', (CURRENT_DATE - INTERVAL '24 days'),  (CURRENT_DATE - INTERVAL '22 days'), 15600.00, 'paga',      'Fatura paga'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0009', 'NF-0009', '22222222-2222-2222-2222-222222222003', '99999999-9999-9999-9999-999999999009', (CURRENT_DATE - INTERVAL '79 days'),  (CURRENT_DATE - INTERVAL '49 days'),   2700.00, 'emitida',   'Aguardando recebimento - vencida')
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, subtotal) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Café Especial - 10 sacas',    10.000, 1000.00, 10000.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Café Superior - 20 sacas',    20.000,  600.00, 12000.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'Café Superior - 15 sacas',    15.000,  650.00,  9750.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0022', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'Café Tradicional - 30 sacas', 30.000,  450.00, 13500.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0031', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'Café Superior - 5 sacas',      5.000,  600.00,  3000.00),
-- NF-0004: item ao preco de tabela (12.000). O desconto de cabecalho (1.200) esta
-- no total da nota (10.800), nao na linha do item.
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0041', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', 'Café Superior - 20 sacas',    20.000,  600.00, 12000.00),
-- NF-0005..0009 (D10): itens espelham os sale_items das vendas novas.
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0051', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005', 'Café Especial - 8 sacas',      8.000, 1000.00,  8000.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0061', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', 'Café Tradicional - 10 sacas', 10.000,  450.00,  4500.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0071', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', 'Café Superior - 25 sacas',    25.000,  650.00, 16250.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0081', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0008', 'Café Especial - 12 sacas',    12.000, 1000.00, 12000.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0082', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0008', 'Café Tradicional - 8 sacas',   8.000,  450.00,  3600.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0091', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0009', 'Café Tradicional - 6 sacas',   6.000,  450.00,  2700.00)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 12. ACCOUNTS PAYABLE (7) — datas relativas a CURRENT_DATE, status variados
-- AP-0001: compra fertilizante/adubo PAGA. AP-0002: peças VENCIDA em aberto.
-- AP-0003: energia elétrica A VENCER (futuro). AP-0004..0007: as 4 parcelas do
-- trator (PO 88...8803): parcelas 1-2 PAGAS, parcela 3 VENCIDA em aberto,
-- parcela 4 A VENCER. Cobre as 3 faixas (vencida em aberto / a vencer / paga).
-- -----------------------------------------------------------------------------
INSERT INTO accounts_payable (id, number, supplier_id, purchase_order_id, description, amount, due_date, paid_at, status, installment_number, installment_total, payment_method, notes) VALUES
('cccccccc-cccc-cccc-cccc-cccccccc0001', 'AP-0001', '33333333-3333-3333-3333-333333333001', '88888888-8888-8888-8888-888888888001', 'Pagto compra fertilizante e adubo',  7600.00, (CURRENT_DATE - INTERVAL '125 days'), (CURRENT_DATE - INTERVAL '125 days')::timestamptz + INTERVAL '11 hours', 'paga',      1, 1, 'a_vista',   NULL),
('cccccccc-cccc-cccc-cccc-cccccccc0002', 'AP-0002', '33333333-3333-3333-3333-333333333003', NULL,                                   'Peças de reposição máquinas',        3200.00, (CURRENT_DATE - INTERVAL '20 days'),  NULL,                                                                    'em_aberto', 1, 1, 'boleto',    'Vencida - aguardando pagamento'),
('cccccccc-cccc-cccc-cccc-cccccccc0003', 'AP-0003', '33333333-3333-3333-3333-333333333001', NULL,                                   'Energia elétrica da fazenda',        1850.00, (CURRENT_DATE + INTERVAL '12 days'),  NULL,                                                                    'em_aberto', 1, 1, 'boleto',    'A vencer'),
('cccccccc-cccc-cccc-cccc-cccccccc0004', 'AP-0004', '33333333-3333-3333-3333-333333333003', '88888888-8888-8888-8888-888888888003', 'Trator New Holland T6 - parcela 1/4', 45500.00, (CURRENT_DATE - INTERVAL '125 days'), (CURRENT_DATE - INTERVAL '125 days')::timestamptz + INTERVAL '10 hours', 'paga',      1, 4, 'parcelado', NULL),
('cccccccc-cccc-cccc-cccc-cccccccc0005', 'AP-0005', '33333333-3333-3333-3333-333333333003', '88888888-8888-8888-8888-888888888003', 'Trator New Holland T6 - parcela 2/4', 45500.00, (CURRENT_DATE - INTERVAL '95 days'),  (CURRENT_DATE - INTERVAL '95 days')::timestamptz + INTERVAL '10 hours',  'paga',      2, 4, 'parcelado', NULL),
('cccccccc-cccc-cccc-cccc-cccccccc0006', 'AP-0006', '33333333-3333-3333-3333-333333333003', '88888888-8888-8888-8888-888888888003', 'Trator New Holland T6 - parcela 3/4', 45500.00, (CURRENT_DATE - INTERVAL '5 days'),   NULL,                                                                    'em_aberto', 3, 4, 'parcelado', 'Vencida'),
('cccccccc-cccc-cccc-cccc-cccccccc0007', 'AP-0007', '33333333-3333-3333-3333-333333333003', '88888888-8888-8888-8888-888888888003', 'Trator New Holland T6 - parcela 4/4', 45500.00, (CURRENT_DATE + INTERVAL '25 days'),  NULL,                                                                    'em_aberto', 4, 4, 'parcelado', 'A vencer')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 13. ACCOUNTS RECEIVABLE (13)
-- AR-0001: Venda 1 quitada (à vista). AR-0002: Venda 2 em aberto (à vista).
-- AR-0003: Dona Rita cancelada.
-- AR-0004/0005/0006: as 3 PARCELAS da Venda 3 (parcelada 3x) — todas com o mesmo
--   invoice_id (NF-0003) e sale_id; parcela 1 quitada, 2 e 3 em aberto. Modelo
--   D9.0: a parcela vive aqui na AR (installment_number/total), não em N notas.
-- AR-0007: Venda 4 (com desconto de cabecalho) em aberto (à vista). amount = LIQUIDO
--   R$ 10.800 (= total_amount da venda/nota, ja com o desconto aplicado).
-- AR-0008..0013 (D10): casos para a fatia de recebiveis do relatorio:
--   AR-0008: Venda 5 QUITADA, received_at ~146 dias atras.
--   AR-0009: Venda 6 CANCELADA (acompanha a nota/venda canceladas).
--   AR-0010/0011: as 2 PARCELAS da Venda 7 — p1 quitada (received ~24 dias atras),
--     p2 em aberto A VENCER (due +5 dias). AR-0012: Venda 8 QUITADA (~22 dias atras).
--   AR-0013: Venda 9 (Dona Rita) em aberto e VENCIDA (due ~49 dias atras) -> inadimplencia.
-- -----------------------------------------------------------------------------
-- DATAS RELATIVAS: due_date/received_at ancorados em CURRENT_DATE. Faixas:
--   QUITADAS (received_at no passado): AR-0001, 0004, 0008, 0010, 0012
--   EM ABERTO A VENCER (due futuro): AR-0006, 0007, 0011
--   EM ABERTO VENCIDAS (due passado): AR-0002, 0005, 0013  -> inadimplência em R$
--   CANCELADAS: AR-0003, 0009
INSERT INTO accounts_receivable (id, number, client_id, sale_id, invoice_id, description, amount, amount_received, due_date, received_at, status, installment_number, installment_total, payment_method, notes) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'AR-0001', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Recebimento da Venda NF-0001',      22000.00, 22000.00, (CURRENT_DATE - INTERVAL '110 days'), (CURRENT_DATE - INTERVAL '110 days')::timestamptz + INTERVAL '14 hours', 'quitado',   1, 1, 'a_vista',   NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'AR-0002', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'Recebimento da Venda NF-0002',      23250.00,     0.00, (CURRENT_DATE - INTERVAL '62 days'),  NULL,                                                                    'em_aberto', 1, 1, 'a_vista',   'Vencida - aguardando recebimento'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'AR-0003', '22222222-2222-2222-2222-222222222003', NULL,                                   NULL,                                   'Conta cancelada - inadimplência',   1500.00,     0.00, (CURRENT_DATE - INTERVAL '97 days'),  NULL,                                                                    'cancelada', 1, 1, 'a_vista',   'Cliente marcado como inadimplente'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'AR-0004', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'Venda NF-0003 - parcela 1/3',        1000.00,  1000.00, (CURRENT_DATE - INTERVAL '36 days'),  (CURRENT_DATE - INTERVAL '36 days')::timestamptz + INTERVAL '14 hours',  'quitado',   1, 3, 'parcelado', NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'AR-0005', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'Venda NF-0003 - parcela 2/3',        1000.00,     0.00, (CURRENT_DATE - INTERVAL '6 days'),   NULL,                                                                    'em_aberto', 2, 3, 'parcelado', 'Vencida'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'AR-0006', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'Venda NF-0003 - parcela 3/3',        1000.00,     0.00, (CURRENT_DATE + INTERVAL '24 days'),  NULL,                                                                    'em_aberto', 3, 3, 'parcelado', 'A vencer'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'AR-0007', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', 'Recebimento da Venda NF-0004 (com desconto)', 10800.00, 0.00, (CURRENT_DATE + INTERVAL '9 days'),   NULL,                                                                    'em_aberto', 1, 1, 'a_vista',   'Valor liquido pos-desconto de cabecalho (a vencer)'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'AR-0008', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005', 'Recebimento da Venda NF-0005',       8000.00,  8000.00, (CURRENT_DATE - INTERVAL '146 days'), (CURRENT_DATE - INTERVAL '146 days')::timestamptz + INTERVAL '16 hours', 'quitado',   1, 1, 'a_vista',   NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'AR-0009', '22222222-2222-2222-2222-222222222003', '99999999-9999-9999-9999-999999999006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', 'Conta cancelada junto com a venda',  4500.00,     0.00, (CURRENT_DATE - INTERVAL '134 days'), NULL,                                                                    'cancelada', 1, 1, 'a_vista',   'Venda 6 cancelada'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'AR-0010', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', 'Venda NF-0007 - parcela 1/2',        8125.00,  8125.00, (CURRENT_DATE - INTERVAL '25 days'),  (CURRENT_DATE - INTERVAL '24 days')::timestamptz + INTERVAL '10 hours',  'quitado',   1, 2, 'parcelado', NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'AR-0011', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', 'Venda NF-0007 - parcela 2/2',        8125.00,     0.00, (CURRENT_DATE + INTERVAL '5 days'),   NULL,                                                                    'em_aberto', 2, 2, 'parcelado', 'A vencer'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012', 'AR-0012', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0008', 'Recebimento da Venda NF-0008',      15600.00, 15600.00, (CURRENT_DATE - INTERVAL '22 days'),  (CURRENT_DATE - INTERVAL '22 days')::timestamptz + INTERVAL '11 hours',  'quitado',   1, 1, 'a_vista',   NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0013', 'AR-0013', '22222222-2222-2222-2222-222222222003', '99999999-9999-9999-9999-999999999009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0009', 'Recebimento da Venda NF-0009',       2700.00,     0.00, (CURRENT_DATE - INTERVAL '49 days'),  NULL,                                                                    'em_aberto', 1, 1, 'a_vista',   'Vencida - Dona Rita inadimplente')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 14. PAYROLL PERIODS (3) — competências RELATIVAS a CURRENT_DATE:
--   período 1 = mês atual - 2 (fechada+paga); período 2 = mês atual - 1
--   (fechada+paga); período 3 = mês atual (aberta). competency_year/month vêm
--   de EXTRACT sobre CURRENT_DATE deslocado, evitando hardcode de 2026.
-- -----------------------------------------------------------------------------
INSERT INTO payroll_periods (id, competency_year, competency_month, status, closed_at, total_amount) VALUES
('dddddddd-dddd-dddd-dddd-dddddddd0001', EXTRACT(YEAR  FROM (CURRENT_DATE - INTERVAL '2 months'))::int, EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '2 months'))::int, 'fechada', (date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '18 hours', 29300.00),
('dddddddd-dddd-dddd-dddd-dddddddd0002', EXTRACT(YEAR  FROM (CURRENT_DATE - INTERVAL '1 month'))::int,  EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 month'))::int,  'fechada', (date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '18 hours', 29943.33),
('dddddddd-dddd-dddd-dddd-dddddddd0003', EXTRACT(YEAR  FROM CURRENT_DATE)::int,                          EXTRACT(MONTH FROM CURRENT_DATE)::int,                          'aberta',  NULL,                                                                   24276.48)
ON CONFLICT (id) DO NOTHING;

-- Entries periodo 1 = mes-2 (PAGO) - 8 funcionários
INSERT INTO payroll_entries (id, payroll_period_id, employee_id, base_salary, extras_hours, extras_value, absences_quantity, absences_value, deductions_value, net_amount, status, paid_at) VALUES
('dddddddd-dddd-dddd-dddd-ddd010100001', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444001', 6000.00, 0, 0,    0, 0,    0, 6000.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100002', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444002', 3500.00, 0, 0,    0, 0,    0, 3500.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100003', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444003', 2200.00, 0, 0,    0, 0,    0, 2200.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100004', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444004', 5500.00, 0, 0,    0, 0,    0, 5500.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100005', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444005', 4000.00, 0, 0,    0, 0,    0, 4000.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100006', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444006', 4500.00, 0, 0,    0, 0,    0, 4500.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100007', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444007', 1800.00, 0, 0,    0, 0,    0, 1800.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd010100008', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444008', 1800.00, 0, 0,    0, 0,    0, 1800.00, 'pago', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours'))
ON CONFLICT (id) DO NOTHING;

-- Entries periodo 2 = mes-1 (PAGO) - 8 funcionários com algumas variações
INSERT INTO payroll_entries (id, payroll_period_id, employee_id, base_salary, extras_hours, extras_value, absences_quantity, absences_value, deductions_value, net_amount, status, paid_at) VALUES
('dddddddd-dddd-dddd-dddd-ddd020200001', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444001', 6000.00, 10, 500.00, 0, 0,      100, 6400.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200002', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444002', 3500.00,  0,   0,   1, 116.67,  0,  3383.33, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200003', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444003', 2200.00,  8, 160.00, 0, 0,      0,  2360.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200004', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444004', 5500.00,  0,   0,   0, 0,      0,  5500.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200005', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444005', 4000.00,  0,   0,   0, 0,      0,  4000.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200006', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444006', 4500.00,  0,   0,   0, 0,      0,  4500.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200007', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444007', 1800.00,  0,   0,   0, 0,      0,  1800.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('dddddddd-dddd-dddd-dddd-ddd020200008', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444008', 1800.00,  0,   0,   0, 0,      0,  1800.00, 'pago', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours'))
ON CONFLICT (id) DO NOTHING;

-- Entries periodo 3 = mes atual (ABERTA, PENDENTE) - 8 funcionários
INSERT INTO payroll_entries (id, payroll_period_id, employee_id, base_salary, extras_hours, extras_value, absences_quantity, absences_value, deductions_value, net_amount, status, paid_at) VALUES
-- net_amount/deductions_value já refletem os itens estatutários (INSS/IRRF/Vale transporte)
-- aplicados automaticamente, coerentes com os payroll_entry_items semeados abaixo.
('dddddddd-dddd-dddd-dddd-ddd030300001', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444001', 6000.00, 0, 0, 0, 0, 1434.82, 4565.18, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300002', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444002', 3500.00, 0, 0, 0, 0,  587.43, 2912.57, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300003', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444003', 2200.00, 0, 0, 0, 0,  305.69, 1894.31, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300004', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444004', 5500.00, 0, 0, 0, 0, 1030.84, 4469.16, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300005', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444005', 4000.00, 0, 0, 0, 0,  531.87, 3468.13, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300006', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444006', 4500.00, 0, 0, 0, 0,  641.49, 3858.51, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300007', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444007', 1800.00, 0, 0, 0, 0,  245.69, 1554.31, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300008', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444008', 1800.00, 0, 0, 0, 0,  245.69, 1554.31, 'pendente', NULL)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 14b. PAYROLL ENTRY ITEMS (detalhamento dos holerites — substitui o backfill manual)
-- Valores coerentes com app/modules/folha/calculations.py (tabelas INSS/IRRF 2024,
-- FGTS 8 por cento, vale transporte limitado a 6 por cento do salário). Períodos pagos (01/02) recebem
-- apenas itens informativos + legados (líquido preservado); o período aberto (03)
-- recebe o cálculo estatutário completo (INSS/IRRF/transporte abatem o líquido).
-- source: automatic = gerado pelo sistema, manual = lançamento legado.
-- -----------------------------------------------------------------------------
INSERT INTO payroll_entry_items (id, payroll_entry_id, payroll_event_id, amount, calculation_base, quantity, percentage, metadata, source) VALUES
-- ===== Periodo 1 = mes-2 (pago) — salário base + benefícios + FGTS informativo =====
-- João Silva
('eeeeeeee-eeee-eeee-eeee-110100000000', 'dddddddd-dddd-dddd-dddd-ddd010100001', 'dededede-dede-dede-dede-dededede0001', 6000.00, 6000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-110800000000', 'dddddddd-dddd-dddd-dddd-ddd010100001', 'dededede-dede-dede-dede-dededede0008',  650.00,  650.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-110900000000', 'dddddddd-dddd-dddd-dddd-ddd010100001', 'dededede-dede-dede-dede-dededede0009',   80.00,   80.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-111000000000', 'dddddddd-dddd-dddd-dddd-ddd010100001', 'dededede-dede-dede-dede-dededede0010',   45.00,   45.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-110600000000', 'dddddddd-dddd-dddd-dddd-ddd010100001', 'dededede-dede-dede-dede-dededede0006',  480.00, 6000.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Maria Santos
('eeeeeeee-eeee-eeee-eeee-120100000000', 'dddddddd-dddd-dddd-dddd-ddd010100002', 'dededede-dede-dede-dede-dededede0001', 3500.00, 3500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-120800000000', 'dddddddd-dddd-dddd-dddd-ddd010100002', 'dededede-dede-dede-dede-dededede0008',  500.00,  500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-121000000000', 'dddddddd-dddd-dddd-dddd-ddd010100002', 'dededede-dede-dede-dede-dededede0010',   45.00,   45.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-120600000000', 'dddddddd-dddd-dddd-dddd-ddd010100002', 'dededede-dede-dede-dede-dededede0006',  280.00, 3500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Carlos Oliveira
('eeeeeeee-eeee-eeee-eeee-130100000000', 'dddddddd-dddd-dddd-dddd-ddd010100003', 'dededede-dede-dede-dede-dededede0001', 2200.00, 2200.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-130800000000', 'dddddddd-dddd-dddd-dddd-ddd010100003', 'dededede-dede-dede-dede-dededede0008',  420.00,  420.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-131000000000', 'dddddddd-dddd-dddd-dddd-ddd010100003', 'dededede-dede-dede-dede-dededede0010',   35.00,   35.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-130600000000', 'dddddddd-dddd-dddd-dddd-ddd010100003', 'dededede-dede-dede-dede-dededede0006',  176.00, 2200.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Ana Pereira (PJ, sem benefícios)
('eeeeeeee-eeee-eeee-eeee-140100000000', 'dddddddd-dddd-dddd-dddd-ddd010100004', 'dededede-dede-dede-dede-dededede0001', 5500.00, 5500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-140600000000', 'dddddddd-dddd-dddd-dddd-ddd010100004', 'dededede-dede-dede-dede-dededede0006',  440.00, 5500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Pedro Costa (PJ)
('eeeeeeee-eeee-eeee-eeee-150100000000', 'dddddddd-dddd-dddd-dddd-ddd010100005', 'dededede-dede-dede-dede-dededede0001', 4000.00, 4000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-150600000000', 'dddddddd-dddd-dddd-dddd-ddd010100005', 'dededede-dede-dede-dede-dededede0006',  320.00, 4000.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Lucas Rodrigues (PJ)
('eeeeeeee-eeee-eeee-eeee-160100000000', 'dddddddd-dddd-dddd-dddd-ddd010100006', 'dededede-dede-dede-dede-dededede0001', 4500.00, 4500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-160600000000', 'dddddddd-dddd-dddd-dddd-ddd010100006', 'dededede-dede-dede-dede-dededede0006',  360.00, 4500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Rafael Almeida (temporário)
('eeeeeeee-eeee-eeee-eeee-170100000000', 'dddddddd-dddd-dddd-dddd-ddd010100007', 'dededede-dede-dede-dede-dededede0001', 1800.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-170800000000', 'dddddddd-dddd-dddd-dddd-ddd010100007', 'dededede-dede-dede-dede-dededede0008',  350.00,  350.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-170600000000', 'dddddddd-dddd-dddd-dddd-ddd010100007', 'dededede-dede-dede-dede-dededede0006',  144.00, 1800.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Sofia Lima (temporário)
('eeeeeeee-eeee-eeee-eeee-180100000000', 'dddddddd-dddd-dddd-dddd-ddd010100008', 'dededede-dede-dede-dede-dededede0001', 1800.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-180800000000', 'dddddddd-dddd-dddd-dddd-ddd010100008', 'dededede-dede-dede-dede-dededede0008',  350.00,  350.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-180600000000', 'dddddddd-dddd-dddd-dddd-ddd010100008', 'dededede-dede-dede-dede-dededede0006',  144.00, 1800.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- ===== Periodo 2 = mes-1 (pago) — inclui horas extras e desconto manual =====
-- João Silva (10h extras = 500, desconto manual 100; base FGTS = 6500)
('eeeeeeee-eeee-eeee-eeee-210100000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0001', 6000.00, 6000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-210200000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0002',  500.00, 6000.00, NULL, NULL, '{}'::jsonb, 'manual'),
('eeeeeeee-eeee-eeee-eeee-210700000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0007',  100.00, 6000.00, NULL, NULL, '{}'::jsonb, 'manual'),
('eeeeeeee-eeee-eeee-eeee-210800000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0008',  650.00,  650.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-210900000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0009',   80.00,   80.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-211000000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0010',   45.00,   45.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-210600000000', 'dddddddd-dddd-dddd-dddd-ddd020200001', 'dededede-dede-dede-dede-dededede0006',  520.00, 6500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Maria Santos (1 falta = 116.67; base FGTS = 3500)
('eeeeeeee-eeee-eeee-eeee-220100000000', 'dddddddd-dddd-dddd-dddd-ddd020200002', 'dededede-dede-dede-dede-dededede0001', 3500.00, 3500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-220800000000', 'dddddddd-dddd-dddd-dddd-ddd020200002', 'dededede-dede-dede-dede-dededede0008',  500.00,  500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-221000000000', 'dddddddd-dddd-dddd-dddd-ddd020200002', 'dededede-dede-dede-dede-dededede0010',   45.00,   45.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-220600000000', 'dddddddd-dddd-dddd-dddd-ddd020200002', 'dededede-dede-dede-dede-dededede0006',  280.00, 3500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Carlos Oliveira (8h extras = 160; base FGTS = 2360)
('eeeeeeee-eeee-eeee-eeee-230100000000', 'dddddddd-dddd-dddd-dddd-ddd020200003', 'dededede-dede-dede-dede-dededede0001', 2200.00, 2200.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-230200000000', 'dddddddd-dddd-dddd-dddd-ddd020200003', 'dededede-dede-dede-dede-dededede0002',  160.00, 2200.00, NULL, NULL, '{}'::jsonb, 'manual'),
('eeeeeeee-eeee-eeee-eeee-230800000000', 'dddddddd-dddd-dddd-dddd-ddd020200003', 'dededede-dede-dede-dede-dededede0008',  420.00,  420.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-231000000000', 'dddddddd-dddd-dddd-dddd-ddd020200003', 'dededede-dede-dede-dede-dededede0010',   35.00,   35.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-230600000000', 'dddddddd-dddd-dddd-dddd-ddd020200003', 'dededede-dede-dede-dede-dededede0006',  188.80, 2360.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Ana Pereira (PJ)
('eeeeeeee-eeee-eeee-eeee-240100000000', 'dddddddd-dddd-dddd-dddd-ddd020200004', 'dededede-dede-dede-dede-dededede0001', 5500.00, 5500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-240600000000', 'dddddddd-dddd-dddd-dddd-ddd020200004', 'dededede-dede-dede-dede-dededede0006',  440.00, 5500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Pedro Costa (PJ)
('eeeeeeee-eeee-eeee-eeee-250100000000', 'dddddddd-dddd-dddd-dddd-ddd020200005', 'dededede-dede-dede-dede-dededede0001', 4000.00, 4000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-250600000000', 'dddddddd-dddd-dddd-dddd-ddd020200005', 'dededede-dede-dede-dede-dededede0006',  320.00, 4000.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Lucas Rodrigues (PJ)
('eeeeeeee-eeee-eeee-eeee-260100000000', 'dddddddd-dddd-dddd-dddd-ddd020200006', 'dededede-dede-dede-dede-dededede0001', 4500.00, 4500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-260600000000', 'dddddddd-dddd-dddd-dddd-ddd020200006', 'dededede-dede-dede-dede-dededede0006',  360.00, 4500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Rafael Almeida (temporário)
('eeeeeeee-eeee-eeee-eeee-270100000000', 'dddddddd-dddd-dddd-dddd-ddd020200007', 'dededede-dede-dede-dede-dededede0001', 1800.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-270800000000', 'dddddddd-dddd-dddd-dddd-ddd020200007', 'dededede-dede-dede-dede-dededede0008',  350.00,  350.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-270600000000', 'dddddddd-dddd-dddd-dddd-ddd020200007', 'dededede-dede-dede-dede-dededede0006',  144.00, 1800.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Sofia Lima (temporário)
('eeeeeeee-eeee-eeee-eeee-280100000000', 'dddddddd-dddd-dddd-dddd-ddd020200008', 'dededede-dede-dede-dede-dededede0001', 1800.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-280800000000', 'dddddddd-dddd-dddd-dddd-ddd020200008', 'dededede-dede-dede-dede-dededede0008',  350.00,  350.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-280600000000', 'dddddddd-dddd-dddd-dddd-ddd020200008', 'dededede-dede-dede-dede-dededede0006',  144.00, 1800.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- ===== Periodo 3 = mes atual (aberto) — cálculo estatutário completo =====
-- João Silva (INSS 641.51, IRRF 473.31 [2 dep], VT 320, FGTS 480)
('eeeeeeee-eeee-eeee-eeee-310100000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0001', 6000.00, 6000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-310400000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0004',  641.51, 6000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-311100000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0011',  473.31, 6000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-310500000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0005',  320.00, 6000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-310600000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0006',  480.00, 6000.00, NULL, 8, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-310800000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0008',  650.00,  650.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-310900000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0009',   80.00,   80.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-311000000000', 'dddddddd-dddd-dddd-dddd-ddd030300001', 'dededede-dede-dede-dede-dededede0010',   45.00,   45.00, NULL, NULL, '{}'::jsonb, 'automatic'),
-- Maria Santos (INSS 308.60, IRRF 68.83 [1 dep], VT 210, FGTS 280)
('eeeeeeee-eeee-eeee-eeee-320100000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0001', 3500.00, 3500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-320400000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0004',  308.60, 3500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-321100000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0011',   68.83, 3500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-320500000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0005',  210.00, 3500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-320600000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0006',  280.00, 3500.00, NULL, 8, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-320800000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0008',  500.00,  500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-321000000000', 'dddddddd-dddd-dddd-dddd-ddd030300002', 'dededede-dede-dede-dede-dededede0010',   45.00,   45.00, NULL, NULL, '{}'::jsonb, 'automatic'),
-- Carlos Oliveira (INSS 173.69, isento IRRF, VT 132, FGTS 176)
('eeeeeeee-eeee-eeee-eeee-330100000000', 'dddddddd-dddd-dddd-dddd-ddd030300003', 'dededede-dede-dede-dede-dededede0001', 2200.00, 2200.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-330400000000', 'dddddddd-dddd-dddd-dddd-ddd030300003', 'dededede-dede-dede-dede-dededede0004',  173.69, 2200.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-330500000000', 'dddddddd-dddd-dddd-dddd-ddd030300003', 'dededede-dede-dede-dede-dededede0005',  132.00, 2200.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-330600000000', 'dddddddd-dddd-dddd-dddd-ddd030300003', 'dededede-dede-dede-dede-dededede0006',  176.00, 2200.00, NULL, 8, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-330800000000', 'dddddddd-dddd-dddd-dddd-ddd030300003', 'dededede-dede-dede-dede-dededede0008',  420.00,  420.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-331000000000', 'dddddddd-dddd-dddd-dddd-ddd030300003', 'dededede-dede-dede-dede-dededede0010',   35.00,   35.00, NULL, NULL, '{}'::jsonb, 'automatic'),
-- Ana Pereira (PJ — INSS 571.51, IRRF 459.33, FGTS 440)
('eeeeeeee-eeee-eeee-eeee-340100000000', 'dddddddd-dddd-dddd-dddd-ddd030300004', 'dededede-dede-dede-dede-dededede0001', 5500.00, 5500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-340400000000', 'dddddddd-dddd-dddd-dddd-ddd030300004', 'dededede-dede-dede-dede-dededede0004',  571.51, 5500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-341100000000', 'dddddddd-dddd-dddd-dddd-ddd030300004', 'dededede-dede-dede-dede-dededede0011',  459.33, 5500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-340600000000', 'dddddddd-dddd-dddd-dddd-ddd030300004', 'dededede-dede-dede-dede-dededede0006',  440.00, 5500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Pedro Costa (PJ — INSS 368.60, IRRF 163.27, FGTS 320)
('eeeeeeee-eeee-eeee-eeee-350100000000', 'dddddddd-dddd-dddd-dddd-ddd030300005', 'dededede-dede-dede-dede-dededede0001', 4000.00, 4000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-350400000000', 'dddddddd-dddd-dddd-dddd-ddd030300005', 'dededede-dede-dede-dede-dededede0004',  368.60, 4000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-351100000000', 'dddddddd-dddd-dddd-dddd-ddd030300005', 'dededede-dede-dede-dede-dededede0011',  163.27, 4000.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-350600000000', 'dddddddd-dddd-dddd-dddd-ddd030300005', 'dededede-dede-dede-dede-dededede0006',  320.00, 4000.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Lucas Rodrigues (PJ — INSS 431.51, IRRF 209.98 [1 dep], FGTS 360)
('eeeeeeee-eeee-eeee-eeee-360100000000', 'dddddddd-dddd-dddd-dddd-ddd030300006', 'dededede-dede-dede-dede-dededede0001', 4500.00, 4500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-360400000000', 'dddddddd-dddd-dddd-dddd-ddd030300006', 'dededede-dede-dede-dede-dededede0004',  431.51, 4500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-361100000000', 'dddddddd-dddd-dddd-dddd-ddd030300006', 'dededede-dede-dede-dede-dededede0011',  209.98, 4500.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-360600000000', 'dddddddd-dddd-dddd-dddd-ddd030300006', 'dededede-dede-dede-dede-dededede0006',  360.00, 4500.00, NULL, 8, '{}'::jsonb, 'automatic'),
-- Rafael Almeida (temporário — INSS 137.69, isento IRRF, VT 108, FGTS 144)
('eeeeeeee-eeee-eeee-eeee-370100000000', 'dddddddd-dddd-dddd-dddd-ddd030300007', 'dededede-dede-dede-dede-dededede0001', 1800.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-370400000000', 'dddddddd-dddd-dddd-dddd-ddd030300007', 'dededede-dede-dede-dede-dededede0004',  137.69, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-370500000000', 'dddddddd-dddd-dddd-dddd-ddd030300007', 'dededede-dede-dede-dede-dededede0005',  108.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-370600000000', 'dddddddd-dddd-dddd-dddd-ddd030300007', 'dededede-dede-dede-dede-dededede0006',  144.00, 1800.00, NULL, 8, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-370800000000', 'dddddddd-dddd-dddd-dddd-ddd030300007', 'dededede-dede-dede-dede-dededede0008',  350.00,  350.00, NULL, NULL, '{}'::jsonb, 'automatic'),
-- Sofia Lima (temporário — INSS 137.69, isento IRRF, VT 108, FGTS 144)
('eeeeeeee-eeee-eeee-eeee-380100000000', 'dddddddd-dddd-dddd-dddd-ddd030300008', 'dededede-dede-dede-dede-dededede0001', 1800.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-380400000000', 'dddddddd-dddd-dddd-dddd-ddd030300008', 'dededede-dede-dede-dede-dededede0004',  137.69, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-380500000000', 'dddddddd-dddd-dddd-dddd-ddd030300008', 'dededede-dede-dede-dede-dededede0005',  108.00, 1800.00, NULL, NULL, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-380600000000', 'dddddddd-dddd-dddd-dddd-ddd030300008', 'dededede-dede-dede-dede-dededede0006',  144.00, 1800.00, NULL, 8, '{}'::jsonb, 'automatic'),
('eeeeeeee-eeee-eeee-eeee-380800000000', 'dddddddd-dddd-dddd-dddd-ddd030300008', 'dededede-dede-dede-dede-dededede0008',  350.00,  350.00, NULL, NULL, '{}'::jsonb, 'automatic')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 15. STOCK MOVEMENTS (seed das entradas/saídas que justificam quantity_on_hand)
-- Entrada inicial de equipamentos; entrada de compra; saídas da produção e vendas;
-- entradas do café produzido.
-- -----------------------------------------------------------------------------
INSERT INTO stock_movements (id, stock_item_id, movement_type, quantity, unit_cost, total_value, description, source_module, reference_id, occurred_at) VALUES
-- Equipamentos iniciais
('ffffffff-ffff-ffff-ffff-ffffff000001', '55555555-5555-5555-5555-555555555021', 'entrada',   1.000, 182000.00, 182000.00, 'Entrada compra do trator (PO 88...8803)', 'compras', '88888888-8888-8888-8888-888888888003', ((CURRENT_DATE - INTERVAL '155 days')::timestamptz + INTERVAL '14 hours')),
('ffffffff-ffff-ffff-ffff-ffffff000002', '55555555-5555-5555-5555-555555555022', 'entrada',   1.000, 250000.00, 250000.00, 'Aquisição inicial da colheitadeira',   'seed',     NULL, ((CURRENT_DATE - INTERVAL '160 days')::timestamptz + INTERVAL '9 hours')),
-- Saldo inicial de café tradicional já existente (antes da produção)
('ffffffff-ffff-ffff-ffff-ffffff000003', '55555555-5555-5555-5555-555555555003', 'entrada',  30.000, 450.00,    13500.00, 'Saldo inicial de café tradicional',     'seed',     NULL, ((CURRENT_DATE - INTERVAL '150 days')::timestamptz + INTERVAL '8 hours')),
-- Consumo de insumos na produção (saídas)
('ffffffff-ffff-ffff-ffff-ffffff000010', '55555555-5555-5555-5555-555555555011', 'saida',   400.000,  12.00,    4800.00, 'Consumo fertilizante na safra talhão A', 'pcp',      '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '8 hours 10 minutes')),
('ffffffff-ffff-ffff-ffff-ffffff000011', '55555555-5555-5555-5555-555555555012', 'saida',   150.000,   8.00,    1200.00, 'Consumo adubo na safra talhão A',        'pcp',      '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '8 hours 10 minutes')),
('ffffffff-ffff-ffff-ffff-ffffff000012', '55555555-5555-5555-5555-555555555013', 'saida',   100.000,  25.00,    2500.00, 'Consumo pesticida na safra talhão A',    'pcp',      '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '8 hours 10 minutes')),
-- Produção: entrada de café produzido (por qualidade)
('ffffffff-ffff-ffff-ffff-ffffff000020', '55555555-5555-5555-5555-555555555001', 'entrada',  19.000, 900.00,    17100.00, 'Safra talhão A - café especial',         'pcp',      '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '12 hours')),
('ffffffff-ffff-ffff-ffff-ffffff000021', '55555555-5555-5555-5555-555555555002', 'entrada',  52.000, 650.00,    33800.00, 'Safra talhão A - café superior',         'pcp',      '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '12 hours')),
('ffffffff-ffff-ffff-ffff-ffffff000022', '55555555-5555-5555-5555-555555555003', 'entrada',  29.000, 450.00,    13050.00, 'Safra talhão A - café tradicional',      'pcp',      '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '12 hours')),
-- Compra concluída: entradas de insumos
('ffffffff-ffff-ffff-ffff-ffffff000030', '55555555-5555-5555-5555-555555555011', 'entrada', 500.000,  12.00,    6000.00, 'Entrada compra AP-0001 - fertilizante',  'compras',  '88888888-8888-8888-8888-888888888001', ((CURRENT_DATE - INTERVAL '131 days')::timestamptz + INTERVAL '14 hours 30 minutes')),
('ffffffff-ffff-ffff-ffff-ffffff000031', '55555555-5555-5555-5555-555555555012', 'entrada', 200.000,   8.00,    1600.00, 'Entrada compra AP-0001 - adubo',         'compras',  '88888888-8888-8888-8888-888888888001', ((CURRENT_DATE - INTERVAL '131 days')::timestamptz + INTERVAL '14 hours 30 minutes')),
-- Vendas: saídas de café
('ffffffff-ffff-ffff-ffff-ffffff000040', '55555555-5555-5555-5555-555555555001', 'saida',    10.000, 900.00,    9000.00, 'Venda NF-0001 - café especial',          'comercial','99999999-9999-9999-9999-999999999001', ((CURRENT_DATE - INTERVAL '115 days')::timestamptz + INTERVAL '10 hours 5 minutes')),
('ffffffff-ffff-ffff-ffff-ffffff000041', '55555555-5555-5555-5555-555555555002', 'saida',    20.000, 650.00,    13000.00, 'Venda NF-0001 - café superior',         'comercial','99999999-9999-9999-9999-999999999001', ((CURRENT_DATE - INTERVAL '115 days')::timestamptz + INTERVAL '10 hours 5 minutes')),
('ffffffff-ffff-ffff-ffff-ffffff000042', '55555555-5555-5555-5555-555555555002', 'saida',    15.000, 650.00,    9750.00, 'Venda NF-0002 - café superior',          'comercial','99999999-9999-9999-9999-999999999002', ((CURRENT_DATE - INTERVAL '92 days')::timestamptz + INTERVAL '11 hours 35 minutes')),
('ffffffff-ffff-ffff-ffff-ffffff000043', '55555555-5555-5555-5555-555555555003', 'saida',    30.000, 450.00,    13500.00, 'Venda NF-0002 - café tradicional',       'comercial','99999999-9999-9999-9999-999999999002', ((CURRENT_DATE - INTERVAL '92 days')::timestamptz + INTERVAL '11 hours 35 minutes')),
-- OP-0002 (colheita parcial talhão B): consumo de insumos + entrada do café colhido
('ffffffff-ffff-ffff-ffff-ffffff000050', '55555555-5555-5555-5555-555555555011', 'saida',   100.000,  12.00,    1200.00, 'Consumo fertilizante OP-0002 talhão B',  'pcp',      '77777777-7777-7777-7777-777777777002', ((CURRENT_DATE - INTERVAL '8 days')::timestamptz + INTERVAL '8 hours')),
('ffffffff-ffff-ffff-ffff-ffffff000051', '55555555-5555-5555-5555-555555555012', 'saida',    50.000,   8.00,     400.00, 'Consumo adubo OP-0002 talhão B',         'pcp',      '77777777-7777-7777-7777-777777777002', ((CURRENT_DATE - INTERVAL '8 days')::timestamptz + INTERVAL '8 hours')),
('ffffffff-ffff-ffff-ffff-ffffff000052', '55555555-5555-5555-5555-555555555001', 'entrada',   9.000, 900.00,    8100.00, 'Colheita OP-0002 - café industria',      'pcp',      '77777777-7777-7777-7777-777777777002', ((CURRENT_DATE - INTERVAL '8 days')::timestamptz + INTERVAL '10 hours')),
('ffffffff-ffff-ffff-ffff-ffffff000053', '55555555-5555-5555-5555-555555555002', 'entrada',  27.000, 650.00,   17550.00, 'Colheita OP-0002 - café embalagem',      'pcp',      '77777777-7777-7777-7777-777777777002', ((CURRENT_DATE - INTERVAL '8 days')::timestamptz + INTERVAL '10 hours'))
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 16. FINANCIAL MOVEMENTS (saldo inicial + eventos; datas RELATIVAS a CURRENT_DATE)
-- Saldo inicial R$ 150.000 (~170 dias atrás).
-- Entradas: 150000 (saldo inicial) + 22000 (recebimento AR-0001)
--           + 32725 (recebimentos das AR quitadas AR-0004/0008/0010/0012:
--           1000 + 8000 + 8125 + 15600) = 204725
-- Saídas:   59043.33 (folha mês-2 + mês-1) + 7600 (pagamento AP-0001)
--           + 91000 (trator: 2 parcelas pagas de 45500) = 157643.33
--           (registros de produção/compra/venda/ajuste/cotação são R$0)
-- Saldo projetado: 204725 - 157643.33 = 47081.67 (positivo, mediano)
-- DECISÃO: saldo mediano deliberado p/ a apresentação — há margem para criar
-- vendas/recebimentos ao vivo. As AR já quitadas no banco geram a entrada de
-- caixa correspondente (respaldo histórico real), em vez de ficarem sem caixa.
-- -----------------------------------------------------------------------------
INSERT INTO financial_movements (id, movement_type, category, amount, description, source_module, reference_id, occurred_at) VALUES
-- Saldo inicial
('a0000000-0000-0000-0000-000000000001', 'entrada', 'saldo_inicial', 150000.00, 'Saldo inicial da conta corrente',             'seed',       NULL,                                   ((CURRENT_DATE - INTERVAL '170 days')::timestamptz)),
-- Produção (registro contábil, R$ 0)
('a0000000-0000-0000-0000-000000000002', 'saida',   'producao',          0.00, 'Produção safra talhão A (registro)',           'pcp',        '77777777-7777-7777-7777-777777777001', ((CURRENT_DATE - INTERVAL '161 days')::timestamptz + INTERVAL '12 hours')),
-- Folha periodo 1 (mes-2) - pago no inicio do mes seguinte
('a0000000-0000-0000-0000-000000000010', 'saida',   'folha',          6000.00, 'Pagamento folha (competência mês-2) - João Silva',         'folha',      'dddddddd-dddd-dddd-dddd-ddd010100001', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000011', 'saida',   'folha',          3500.00, 'Pagamento folha (competência mês-2) - Maria Santos',       'folha',      'dddddddd-dddd-dddd-dddd-ddd010100002', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000012', 'saida',   'folha',          2200.00, 'Pagamento folha (competência mês-2) - Carlos Oliveira',    'folha',      'dddddddd-dddd-dddd-dddd-ddd010100003', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000013', 'saida',   'folha',          5500.00, 'Pagamento folha (competência mês-2) - Ana Pereira',        'folha',      'dddddddd-dddd-dddd-dddd-ddd010100004', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000014', 'saida',   'folha',          4000.00, 'Pagamento folha (competência mês-2) - Pedro Costa',        'folha',      'dddddddd-dddd-dddd-dddd-ddd010100005', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000015', 'saida',   'folha',          4500.00, 'Pagamento folha (competência mês-2) - Lucas Rodrigues',    'folha',      'dddddddd-dddd-dddd-dddd-ddd010100006', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000016', 'saida',   'folha',          1800.00, 'Pagamento folha (competência mês-2) - Rafael Almeida',     'folha',      'dddddddd-dddd-dddd-dddd-ddd010100007', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000017', 'saida',   'folha',          1800.00, 'Pagamento folha (competência mês-2) - Sofia Lima',         'folha',      'dddddddd-dddd-dddd-dddd-ddd010100008', ((date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::timestamptz + INTERVAL '4 days 10 hours')),
-- Compra concluída (registro)
('a0000000-0000-0000-0000-000000000020', 'saida',   'compra',            0.00, 'Compra concluída AP-0001 (registro)',          'compras',    '88888888-8888-8888-8888-888888888001', ((CURRENT_DATE - INTERVAL '131 days')::timestamptz + INTERVAL '14 hours 30 minutes')),
-- Pagamento AP-0001
('a0000000-0000-0000-0000-000000000021', 'saida',   'pagamento',      7600.00, 'Pagamento AP-0001 - AgroInsumos',              'financeiro', 'cccccccc-cccc-cccc-cccc-cccccccc0001', ((CURRENT_DATE - INTERVAL '125 days')::timestamptz + INTERVAL '11 hours')),
-- Venda 1 (registro) + recebimento
('a0000000-0000-0000-0000-000000000030', 'entrada', 'venda',             0.00, 'Venda NF-0001 (registro)',                     'comercial',  '99999999-9999-9999-9999-999999999001', ((CURRENT_DATE - INTERVAL '115 days')::timestamptz + INTERVAL '10 hours')),
('a0000000-0000-0000-0000-000000000031', 'entrada', 'recebimento',   22000.00, 'Recebimento AR-0001 - Cafeteria Grão Fino',    'financeiro', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', ((CURRENT_DATE - INTERVAL '110 days')::timestamptz + INTERVAL '14 hours 30 minutes')),
-- Folha periodo 2 (mes-1)
('a0000000-0000-0000-0000-000000000040', 'saida',   'folha',          6400.00, 'Pagamento folha (competência mês-1) - João Silva',         'folha',      'dddddddd-dddd-dddd-dddd-ddd020200001', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000041', 'saida',   'folha',          3383.33, 'Pagamento folha (competência mês-1) - Maria Santos',       'folha',      'dddddddd-dddd-dddd-dddd-ddd020200002', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000042', 'saida',   'folha',          2360.00, 'Pagamento folha (competência mês-1) - Carlos Oliveira',    'folha',      'dddddddd-dddd-dddd-dddd-ddd020200003', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000043', 'saida',   'folha',          5500.00, 'Pagamento folha (competência mês-1) - Ana Pereira',        'folha',      'dddddddd-dddd-dddd-dddd-ddd020200004', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000044', 'saida',   'folha',          4000.00, 'Pagamento folha (competência mês-1) - Pedro Costa',        'folha',      'dddddddd-dddd-dddd-dddd-ddd020200005', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000045', 'saida',   'folha',          4500.00, 'Pagamento folha (competência mês-1) - Lucas Rodrigues',    'folha',      'dddddddd-dddd-dddd-dddd-ddd020200006', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000046', 'saida',   'folha',          1800.00, 'Pagamento folha (competência mês-1) - Rafael Almeida',     'folha',      'dddddddd-dddd-dddd-dddd-ddd020200007', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
('a0000000-0000-0000-0000-000000000047', 'saida',   'folha',          1800.00, 'Pagamento folha (competência mês-1) - Sofia Lima',         'folha',      'dddddddd-dddd-dddd-dddd-ddd020200008', ((date_trunc('month', CURRENT_DATE))::timestamptz + INTERVAL '4 days 10 hours')),
-- Ajuste pequeno de estoque (R$ 0)
('a0000000-0000-0000-0000-000000000050', 'saida',   'ajuste',            0.00, 'Ajuste manual de estoque - contagem',          'estoque',    NULL,                                   ((CURRENT_DATE - INTERVAL '90 days')::timestamptz + INTERVAL '9 hours')),
-- Venda 2 (registro, ainda não recebida)
('a0000000-0000-0000-0000-000000000060', 'entrada', 'venda',             0.00, 'Venda NF-0002 (registro, AR em aberto)',       'comercial',  '99999999-9999-9999-9999-999999999002', ((CURRENT_DATE - INTERVAL '92 days')::timestamptz + INTERVAL '11 hours 30 minutes')),
-- Venda 4 (registro, com desconto de cabecalho, AR em aberto)
('a0000000-0000-0000-0000-000000000061', 'entrada', 'venda',             0.00, 'Venda NF-0004 (registro, com desconto, AR em aberto)', 'comercial',  '99999999-9999-9999-9999-999999999004', ((CURRENT_DATE - INTERVAL '51 days')::timestamptz + INTERVAL '14 hours')),
-- Recebimentos das vendas QUITADAS (respaldo historico de caixa: AR ja quitadas
-- no banco geram a entrada correspondente -> saldo mediano com margem p/ demo).
('a0000000-0000-0000-0000-000000000032', 'entrada', 'recebimento',    1000.00, 'Recebimento AR-0004 - Venda NF-0003 parcela 1/3', 'financeiro', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', ((CURRENT_DATE - INTERVAL '36 days')::timestamptz + INTERVAL '14 hours 30 minutes')),
('a0000000-0000-0000-0000-000000000033', 'entrada', 'recebimento',    8000.00, 'Recebimento AR-0008 - Venda NF-0005',             'financeiro', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', ((CURRENT_DATE - INTERVAL '146 days')::timestamptz + INTERVAL '16 hours 30 minutes')),
('a0000000-0000-0000-0000-000000000034', 'entrada', 'recebimento',    8125.00, 'Recebimento AR-0010 - Venda NF-0007 parcela 1/2', 'financeiro', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', ((CURRENT_DATE - INTERVAL '24 days')::timestamptz + INTERVAL '10 hours 30 minutes')),
('a0000000-0000-0000-0000-000000000035', 'entrada', 'recebimento',   15600.00, 'Recebimento AR-0012 - Venda NF-0008',             'financeiro', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012', ((CURRENT_DATE - INTERVAL '22 days')::timestamptz + INTERVAL '11 hours 30 minutes')),
-- Compra do trator (registro R$0) + pagamentos das parcelas 1 e 2 (PAGAS).
('a0000000-0000-0000-0000-000000000080', 'saida',   'compra',            0.00, 'Compra concluída - Trator New Holland T6 (registro)', 'compras',    '88888888-8888-8888-8888-888888888003', ((CURRENT_DATE - INTERVAL '155 days')::timestamptz + INTERVAL '14 hours')),
('a0000000-0000-0000-0000-000000000081', 'saida',   'pagamento',     45500.00, 'Pagamento AP-0004 - Trator parcela 1/4',       'financeiro', 'cccccccc-cccc-cccc-cccc-cccccccc0004', ((CURRENT_DATE - INTERVAL '125 days')::timestamptz + INTERVAL '10 hours')),
('a0000000-0000-0000-0000-000000000082', 'saida',   'pagamento',     45500.00, 'Pagamento AP-0005 - Trator parcela 2/4',       'financeiro', 'cccccccc-cccc-cccc-cccc-cccccccc0005', ((CURRENT_DATE - INTERVAL '95 days')::timestamptz + INTERVAL '10 hours')),
-- Produção OP-0002 (registro R$0, colheita parcial em andamento)
('a0000000-0000-0000-0000-000000000083', 'saida',   'producao',          0.00, 'Produção safra talhão B - OP-0002 (registro)', 'pcp',        '77777777-7777-7777-7777-777777777002', ((CURRENT_DATE - INTERVAL '8 days')::timestamptz + INTERVAL '10 hours'))
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 17. NOTIFICATIONS (exemplos)
-- -----------------------------------------------------------------------------
-- Mensagens sem data fixa no texto (o seed é "fresco"): descrevem o estado, não a data.
INSERT INTO notifications (id, type, title, message, module, link, is_read, user_id) VALUES
('ab000000-0000-0000-0000-000000000001', 'warning', 'Estoque abaixo do mínimo', 'Pesticida Fungicida (INS-PEST) está com 15 litros (mín. 20)',     'estoque',    '/estoque',    FALSE, '11111111-1111-1111-1111-111111111001'),
('ab000000-0000-0000-0000-000000000002', 'warning', 'Conta a receber vencida',  'NF-0002 (R$ 23.250,00) está vencida e aguardando recebimento',   'financeiro', '/financeiro', FALSE, '11111111-1111-1111-1111-111111111001'),
('ab000000-0000-0000-0000-000000000003', 'info',    'Folha do mês aberta',      'Os lançamentos da competência corrente estão abertos',           'folha',      '/folha',      TRUE,  '11111111-1111-1111-1111-111111111001'),
('ab000000-0000-0000-0000-000000000004', 'warning', 'Cliente inadimplente',     'Mercearia Dona Rita possui conta vencida em aberto (NF-0009)',    'comercial',  '/comercial',  FALSE, '11111111-1111-1111-1111-111111111001'),
('ab000000-0000-0000-0000-000000000005', 'info',    'Recebimento confirmado',   'Recebimento da venda NF-0008 (R$ 15.600,00) confirmado',          'financeiro', '/financeiro', TRUE,  '11111111-1111-1111-1111-111111111001')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 18. COTAÇÕES (sub-fluxo de Compras) — 3 cenários
-- Cot 1 (produto, concluída) gerou a PO 88...8802; Cot 2 (produto) aguarda o
-- financeiro; Cot 3 (serviço) ainda coletando propostas.
-- FK circular: quotations.winning_proposal_id -> quotation_proposals e
-- quotation_proposals.quotation_id -> quotations. Por isso inserimos as cotações
-- com winning_proposal_id NULL e definimos o vencedor via UPDATE no final.
-- -----------------------------------------------------------------------------

-- 18a. PurchaseOrder gerada pela Cotação 1 (status "aprovada" = aguardando
-- conferência; ainda não recebida, logo sem stock_movement / accounts_payable).
INSERT INTO purchase_orders (id, supplier_id, status, total_amount, ordered_at, received_at, notes, order_type) VALUES
('88888888-8888-8888-8888-888888888002', '33333333-3333-3333-3333-333333333001', 'aprovada', 3020.00, ((CURRENT_DATE - INTERVAL '66 days')::timestamptz + INTERVAL '9 hours'), NULL, 'Gerada a partir da cotação b0000000-0000-0000-0000-b00000000001', 'produto')
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_order_items (id, purchase_order_id, stock_item_id, description, quantity, unit_price, subtotal) VALUES
('88888888-8888-8888-8888-888888888021', '88888888-8888-8888-8888-888888888002', '55555555-5555-5555-5555-555555555011', 'Fertilizante NPK 200kg', 200.000, 11.50, 2300.00),
('88888888-8888-8888-8888-888888888022', '88888888-8888-8888-8888-888888888002', '55555555-5555-5555-5555-555555555013', 'Pesticida Fungicida 30L',  30.000, 24.00,  720.00)
ON CONFLICT (id) DO NOTHING;

-- 18b. Cotações (winning_proposal_id definido por UPDATE em 18f).
INSERT INTO quotations (id, order_type, status, service_description, notes, cancellation_note, winning_proposal_id, purchase_order_id, deleted_at) VALUES
('b0000000-0000-0000-0000-b00000000001', 'produto', 'concluida',                       NULL,                                                                          'Reposição de NPK e fungicida via cotação', NULL, NULL, '88888888-8888-8888-8888-888888888002', NULL),
('b0000000-0000-0000-0000-b00000000002', 'produto', 'aguardando_aprovacao_financeiro', NULL,                                                                          'Cotação de adubo aguardando o financeiro',  NULL, NULL, NULL,                                   NULL),
('b0000000-0000-0000-0000-b00000000003', 'servico', 'em_andamento',                    'Manutenção preventiva do trator New Holland T6 — revisão de 500h',           'Coletando propostas de manutenção',          NULL, NULL, NULL,                                   NULL)
ON CONFLICT (id) DO NOTHING;

-- 18c. Itens das cotações de produto (serviço não tem itens de estoque).
INSERT INTO quotation_items (id, quotation_id, stock_item_id, quantity) VALUES
-- Cotação 1: 200kg NPK + 30L Pesticida
('b1000000-0000-0000-0000-b10000000011', 'b0000000-0000-0000-0000-b00000000001', '55555555-5555-5555-5555-555555555011', 200.000),
('b1000000-0000-0000-0000-b10000000012', 'b0000000-0000-0000-0000-b00000000001', '55555555-5555-5555-5555-555555555013',  30.000),
-- Cotação 2: 100kg Adubo Orgânico
('b1000000-0000-0000-0000-b10000000021', 'b0000000-0000-0000-0000-b00000000002', '55555555-5555-5555-5555-555555555012', 100.000)
ON CONFLICT (id) DO NOTHING;

-- 18d. Propostas. total_price só é usado em cotações de serviço; nas de produto
-- o valor é derivado dos quotation_proposal_items (total_price = NULL).
INSERT INTO quotation_proposals (id, quotation_id, supplier_id, total_price, notes) VALUES
-- Cotação 1: AgroInsumos (vencedora, R$3.020,00) x Fazenda São Pedro (R$3.180,00)
('b2000000-0000-0000-0000-b20000000011', 'b0000000-0000-0000-0000-b00000000001', '33333333-3333-3333-3333-333333333001', NULL, 'Melhor preço — vencedora'),
('b2000000-0000-0000-0000-b20000000012', 'b0000000-0000-0000-0000-b00000000001', '33333333-3333-3333-3333-333333333002', NULL, 'Proposta concorrente'),
-- Cotação 2: AgroInsumos (vencedora, R$7,80/kg) x Máquinas Serra Verde (R$8,50/kg)
('b2000000-0000-0000-0000-b20000000021', 'b0000000-0000-0000-0000-b00000000002', '33333333-3333-3333-3333-333333333001', NULL, 'Melhor preço — vencedora'),
('b2000000-0000-0000-0000-b20000000022', 'b0000000-0000-0000-0000-b00000000002', '33333333-3333-3333-3333-333333333003', NULL, 'Proposta concorrente'),
-- Cotação 3 (serviço): Máquinas Serra Verde, preço fechado de R$2.800,00
('b2000000-0000-0000-0000-b20000000031', 'b0000000-0000-0000-0000-b00000000003', '33333333-3333-3333-3333-333333333003', 2800.00, 'Revisão de 500h, peças inclusas')
ON CONFLICT (id) DO NOTHING;

-- 18e. Preços unitários por item dentro de cada proposta de produto.
INSERT INTO quotation_proposal_items (id, proposal_id, quotation_item_id, unit_price) VALUES
-- Cotação 1 / AgroInsumos: NPK R$11,50 + Pesticida R$24,00 = R$3.020,00
('b3000000-0000-0000-0000-b30000000111', 'b2000000-0000-0000-0000-b20000000011', 'b1000000-0000-0000-0000-b10000000011', 11.50),
('b3000000-0000-0000-0000-b30000000112', 'b2000000-0000-0000-0000-b20000000011', 'b1000000-0000-0000-0000-b10000000012', 24.00),
-- Cotação 1 / Fazenda São Pedro: NPK R$12,00 + Pesticida R$26,00 = R$3.180,00
('b3000000-0000-0000-0000-b30000000121', 'b2000000-0000-0000-0000-b20000000012', 'b1000000-0000-0000-0000-b10000000011', 12.00),
('b3000000-0000-0000-0000-b30000000122', 'b2000000-0000-0000-0000-b20000000012', 'b1000000-0000-0000-0000-b10000000012', 26.00),
-- Cotação 2 / AgroInsumos: Adubo R$7,80
('b3000000-0000-0000-0000-b30000000211', 'b2000000-0000-0000-0000-b20000000021', 'b1000000-0000-0000-0000-b10000000021',  7.80),
-- Cotação 2 / Máquinas Serra Verde: Adubo R$8,50
('b3000000-0000-0000-0000-b30000000221', 'b2000000-0000-0000-0000-b20000000022', 'b1000000-0000-0000-0000-b10000000021',  8.50)
ON CONFLICT (id) DO NOTHING;

-- 18f. Define a proposta vencedora (após as propostas existirem — FK circular).
UPDATE quotations SET winning_proposal_id = 'b2000000-0000-0000-0000-b20000000011'
WHERE id = 'b0000000-0000-0000-0000-b00000000001';
UPDATE quotations SET winning_proposal_id = 'b2000000-0000-0000-0000-b20000000021'
WHERE id = 'b0000000-0000-0000-0000-b00000000002';

-- 18g. Movimentos financeiros de registro da Cotação 1 (R$0 — não afetam saldo;
-- apenas histórico: criação, seleção de vencedor e aprovação do financeiro).
INSERT INTO financial_movements (id, movement_type, category, amount, description, source_module, reference_id, occurred_at) VALUES
('a0000000-0000-0000-0000-000000000070', 'saida', 'compra', 0.00, 'Cotação criada (registro) - reposição NPK e fungicida', 'compras', 'b0000000-0000-0000-0000-b00000000001', ((CURRENT_DATE - INTERVAL '71 days')::timestamptz + INTERVAL '9 hours')),
('a0000000-0000-0000-0000-000000000071', 'saida', 'compra', 0.00, 'Cotação - proposta vencedora selecionada (AgroInsumos)', 'compras', 'b0000000-0000-0000-0000-b00000000001', ((CURRENT_DATE - INTERVAL '68 days')::timestamptz + INTERVAL '10 hours')),
('a0000000-0000-0000-0000-000000000072', 'saida', 'compra', 0.00, 'Cotação aprovada pelo financeiro - pedido gerado',      'compras', 'b0000000-0000-0000-0000-b00000000001', ((CURRENT_DATE - INTERVAL '67 days')::timestamptz + INTERVAL '11 hours'))
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Resumo do seed (datas TODAS relativas a CURRENT_DATE — seed sempre "fresco"):
--   1 usuário admin
--   3 clientes (1 inadimplente: Mercearia Dona Rita)
--   3 fornecedores
--   8 cargos, 8 funcionários (3 CLT, 3 PJ, 2 Temp)
--   11 itens de estoque (3 cafés, 4 insumos, 1 trator, 1 colheitadeira, 1 descarte, 1 embalagem)
--     — INS-PEST e CAFE-TRA abaixo do mínimo; demais acima (dispara notificação)
--   2 talhões, 4 atividades
--   2 ordens de produção (1 concluída 100%%, 1 em execução parcial 40%%), 1 colheita parcial
--   4 ordens de compra (2 concluídas, 1 em conferência, 1 aprovada gerada pela Cotação 1)
--   9 vendas (3 entregues, 5 realizadas, 1 cancelada — 2 parceladas, 1 com desconto;
--             sold_at espalhado nos últimos ~5 meses para a série temporal do relatório)
--   9 faturas (NF-0001/0005/0008 pagas; NF-0002/0003/0004/0007/0009 emitidas; NF-0006 cancelada)
--   7 contas a pagar (3 pagas, 2 vencidas em aberto, 2 a vencer)
--   13 contas a receber (5 quitadas c/ received_at, 6 em aberto [a vencer e vencidas], 2 canceladas)
--             — massa para a fatia de recebíveis (recebido x a receber x inadimplência em R$)
--   3 períodos de folha (mês-2, mês-1 fechadas+pagas; mês atual aberta), 24 lançamentos
--   11 eventos de folha
--   19 movimentações de estoque (inclui consumo/colheita da OP-0002)
--   36 movimentações financeiras (saldo final mediano R$ 47.081,67)
--   5 notificações
--   3 cotações (1 produto concluída, 1 produto aguardando financeiro, 1 serviço em andamento)
--     3 itens de cotação, 5 propostas, 6 itens de proposta
-- Saldo atual previsto: R$ 47.081,67 (positivo, mediano; trator pesa no caixa, mas
--   os recebimentos das vendas quitadas dão margem para ações ao vivo na apresentação)
-- =============================================================================
