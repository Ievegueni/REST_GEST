/**
 * Dados de demonstração para o tenant "Restaurante Demo" (só desenvolvimento):
 * 100 artigos, fornecedores, fichas técnicas e ~60 dias de movimentos nas duas unidades,
 * sempre pelos serviços da aplicação (recepções, importação de vendas, quebras, consumos,
 * transferências, inventário) para que stock, custos médios e relatórios fiquem coerentes.
 *
 * Correr: pnpm --filter @restgest/api db:mock   (depois de db:seed)
 * Corre com NODE_ENV=test só para os jobs (parse das importações) correrem logo, sem fila.
 */
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { systemAuth, type AuthContext } from '../src/core/auth';
import { prisma, tenantDb } from '../src/core/prisma';
import { evaluateStock, sweepTenant } from '../src/modules/alerts/engine';
import { closeCount, openCount, saveCounts } from '../src/modules/inventory/service';
import { createReceipt } from '../src/modules/purchases/service';
import { explode, loadRecipeBook } from '../src/modules/recipes/book';
import { addDays, todayLocal } from '../src/modules/reports/common';
import { confirmImport, createImport } from '../src/modules/sales-import/service';
import { postMovements, type MovementInput } from '../src/modules/stock/engine';
import { createTransfer, receiveTransfer, sendTransfer } from '../src/modules/transfers/service';

const DAYS = 60;

// ---------- aleatório reprodutível ----------
let seed = 20261031;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const noise = (pct: number) => 1 + (rnd() * 2 - 1) * pct;

// ---------- catálogo ----------
type Cat =
  | 'cer'
  | 'ref'
  | 'agu'
  | 'vin'
  | 'des'
  | 'caf'
  | 'car'
  | 'pei'
  | 'leg'
  | 'mer'
  | 'lac'
  | 'pad'
  | 'lim'
  | 'dsc';
const CATS: Record<Cat, { parent: string; name: string; sup: string }> = {
  cer: { parent: 'Bebidas', name: 'Cervejas', sup: 'beb' },
  ref: { parent: 'Bebidas', name: 'Refrigerantes e sumos', sup: 'beb' },
  agu: { parent: 'Bebidas', name: 'Águas', sup: 'beb' },
  vin: { parent: 'Bebidas', name: 'Vinhos', sup: 'vin' },
  des: { parent: 'Bebidas', name: 'Destilados e licores', sup: 'vin' },
  caf: { parent: 'Bebidas', name: 'Cafetaria', sup: 'mer' },
  car: { parent: 'Alimentos', name: 'Carnes', sup: 'tal' },
  pei: { parent: 'Alimentos', name: 'Peixe e marisco', sup: 'pei' },
  leg: { parent: 'Alimentos', name: 'Legumes e fruta', sup: 'hor' },
  mer: { parent: 'Alimentos', name: 'Mercearia', sup: 'mer' },
  lac: { parent: 'Alimentos', name: 'Lacticínios e ovos', sup: 'mer' },
  pad: { parent: 'Alimentos', name: 'Padaria', sup: 'mer' },
  lim: { parent: 'Limpeza', name: 'Produtos de limpeza', sup: 'lim' },
  dsc: { parent: 'Descartáveis', name: 'Descartáveis', sup: 'lim' },
};

const SUPPLIERS = {
  beb: { name: 'Distribuidora Kianda Bebidas', terms: 30 },
  vin: { name: 'Garrafeira Atlântico', terms: 45 },
  tal: { name: 'Talho Central do Mercado', terms: 15 },
  pei: { name: 'Peixaria Ilha de Luanda', terms: 7 },
  hor: { name: 'Hortícolas do Bengo', terms: 7 },
  mer: { name: 'Mercearia Grossista Kinaxixi', terms: 30 },
  lim: { name: 'HigiPro Angola', terms: 30 },
} as const;

/** [código, nome, categoria, unid. stock, compra [unid, factor], consumo [unid, factor], custo/unid. stock (Kz), uso diário base (só não-receita)] */
type P = [
  string,
  string,
  Cat,
  string,
  [string, number] | null,
  [string, number] | null,
  number,
  number?,
];
const PRODUCTS: P[] = [
  // Cervejas
  ['CER01', 'Cerveja Cuca 33cl', 'cer', 'gf', ['cx', 24], null, 350],
  ['CER02', 'Cerveja Nocal 33cl', 'cer', 'gf', ['cx', 24], null, 340],
  ['CER03', 'Cerveja EKA 33cl', 'cer', 'gf', ['cx', 24], null, 330],
  ['CER04', "Cerveja N'gola 33cl", 'cer', 'gf', ['cx', 24], null, 340],
  ['CER05', 'Cerveja Heineken 33cl', 'cer', 'gf', ['cx', 24], null, 650],
  ['CER06', 'Cerveja Super Bock 33cl', 'cer', 'gf', ['cx', 24], null, 600],
  ['CER07', 'Cerveja Sagres 33cl', 'cer', 'gf', ['cx', 24], null, 580],
  ['CER08', 'Cerveja Castle Lite 33cl', 'cer', 'gf', ['cx', 24], null, 550],
  // Refrigerantes e sumos
  ['REF01', 'Coca-Cola lata 33cl', 'ref', 'un', ['cx', 24], null, 300],
  ['REF02', 'Coca-Cola Zero lata 33cl', 'ref', 'un', ['cx', 24], null, 320],
  ['REF03', 'Fanta Laranja lata 33cl', 'ref', 'un', ['cx', 24], null, 290],
  ['REF04', 'Sprite lata 33cl', 'ref', 'un', ['cx', 24], null, 290],
  ['REF05', 'Pepsi lata 33cl', 'ref', 'un', ['cx', 24], null, 280],
  ['REF06', '7Up lata 33cl', 'ref', 'un', ['cx', 24], null, 280],
  ['REF07', 'Blue Laranja 33cl', 'ref', 'un', ['cx', 24], null, 250],
  ['REF08', 'Água tónica Schweppes', 'ref', 'un', ['cx', 24], null, 400],
  ['REF09', 'Red Bull 25cl', 'ref', 'un', ['cx', 24], null, 900],
  ['REF10', 'Sumo Compal Manga 1L', 'ref', 'un', ['cx', 6], ['ml', 1 / 1000], 1200],
  ['REF11', 'Sumo Compal Pêssego 1L', 'ref', 'un', ['cx', 6], ['ml', 1 / 1000], 1200],
  // Águas
  ['AGU01', 'Água Pura 1,5L', 'agu', 'gf', ['cx', 6], null, 220],
  ['AGU02', 'Água Pura 0,33L', 'agu', 'gf', ['cx', 24], null, 110],
  ['AGU03', 'Água com gás Pedras 25cl', 'agu', 'gf', ['cx', 24], null, 450],
  ['AGU04', 'Água Perrier 33cl', 'agu', 'gf', ['cx', 24], null, 800],
  // Vinhos
  ['VIN01', 'Vinho tinto Alentejo (casa)', 'vin', 'gf', ['cx', 6], ['ml', 1 / 750], 3500],
  ['VIN02', 'Vinho tinto Douro reserva', 'vin', 'gf', ['cx', 6], ['ml', 1 / 750], 9500],
  ['VIN03', 'Vinho verde branco', 'vin', 'gf', ['cx', 6], ['ml', 1 / 750], 4200],
  ['VIN04', 'Vinho rosé', 'vin', 'gf', ['cx', 6], ['ml', 1 / 750], 4500],
  ['VIN05', 'Espumante bruto', 'vin', 'gf', ['cx', 6], ['ml', 1 / 750], 7000],
  ['VIN06', 'Vinho branco Alentejo (casa)', 'vin', 'gf', ['cx', 6], ['ml', 1 / 750], 3500],
  // Destilados e licores
  ['DES01', 'Whisky Johnnie Walker Red 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 14000],
  ['DES02', 'Whisky Johnnie Walker Black 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 26000],
  ['DES03', 'Vodka Absolut 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 12000],
  ['DES04', "Gin Gordon's 70cl", 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 11000],
  ['DES05', 'Rum Bacardi 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 10500],
  ['DES06', 'Tequila José Cuervo 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 15000],
  ['DES07', 'Licor Beirão 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 9000],
  ['DES08', 'Amarula 70cl', 'des', 'gf', ['cx', 6], ['ml', 1 / 700], 12500],
  ['DES09', 'Martini Bianco 1L', 'des', 'gf', ['cx', 6], ['ml', 1 / 1000], 8000],
  // Cafetaria
  ['CAF01', 'Café em grão', 'caf', 'kg', null, ['g', 1 / 1000], 9000],
  ['CAF02', 'Açúcar em saquetas', 'caf', 'un', ['cx', 1000], null, 8],
  ['CAF03', 'Leite UHT meio-gordo 1L', 'caf', 'L', ['cx', 12], ['ml', 1 / 1000], 900],
  ['CAF04', 'Chá preto (saquetas)', 'caf', 'un', ['cx', 100], null, 40],
  ['CAF05', 'Chocolate em pó', 'caf', 'kg', null, ['g', 1 / 1000], 6500],
  // Carnes
  ['CAR01', 'Bife do lombo', 'car', 'kg', null, ['g', 1 / 1000], 9500],
  ['CAR02', 'Picanha', 'car', 'kg', null, ['g', 1 / 1000], 11000],
  ['CAR03', 'Frango inteiro', 'car', 'kg', null, ['g', 1 / 1000], 3200],
  ['CAR04', 'Peito de frango', 'car', 'kg', null, ['g', 1 / 1000], 4800],
  ['CAR05', 'Costeleta de porco', 'car', 'kg', null, ['g', 1 / 1000], 5500],
  ['CAR06', 'Entrecosto', 'car', 'kg', null, ['g', 1 / 1000], 5000],
  ['CAR07', 'Carne picada de vaca', 'car', 'kg', null, ['g', 1 / 1000], 6200],
  ['CAR08', 'Chouriço de carne', 'car', 'kg', null, ['g', 1 / 1000], 7500],
  ['CAR09', 'Bacon fatiado', 'car', 'kg', null, ['g', 1 / 1000], 8500],
  // Peixe e marisco
  ['PEI01', 'Garoupa fresca', 'pei', 'kg', null, ['g', 1 / 1000], 7000],
  ['PEI02', 'Cacusso', 'pei', 'kg', null, ['g', 1 / 1000], 3800],
  ['PEI03', 'Corvina', 'pei', 'kg', null, ['g', 1 / 1000], 4500],
  ['PEI04', 'Camarão tigre', 'pei', 'kg', null, ['g', 1 / 1000], 14000],
  ['PEI05', 'Lulas', 'pei', 'kg', null, ['g', 1 / 1000], 6500],
  ['PEI06', 'Bacalhau seco', 'pei', 'kg', null, ['g', 1 / 1000], 12000],
  // Legumes e fruta
  ['LEG01', 'Batata', 'leg', 'kg', ['cx', 25], ['g', 1 / 1000], 600],
  ['LEG02', 'Cebola', 'leg', 'kg', ['cx', 20], ['g', 1 / 1000], 550],
  ['LEG03', 'Alho', 'leg', 'kg', null, ['g', 1 / 1000], 2500],
  ['LEG04', 'Tomate', 'leg', 'kg', ['cx', 15], ['g', 1 / 1000], 900],
  ['LEG05', 'Alface', 'leg', 'un', null, null, 300],
  ['LEG06', 'Pimento', 'leg', 'kg', null, ['g', 1 / 1000], 1500],
  ['LEG07', 'Cenoura', 'leg', 'kg', null, ['g', 1 / 1000], 700],
  ['LEG08', 'Limão', 'leg', 'kg', null, ['g', 1 / 1000], 1200],
  ['LEG09', 'Banana-pão', 'leg', 'kg', null, ['g', 1 / 1000], 800],
  ['LEG10', 'Mandioca', 'leg', 'kg', ['cx', 20], ['g', 1 / 1000], 450],
  ['LEG11', 'Couve', 'leg', 'kg', null, ['g', 1 / 1000], 600],
  ['LEG12', 'Ananás', 'leg', 'un', null, null, 900],
  // Mercearia
  ['MER01', 'Arroz agulha', 'mer', 'kg', ['cx', 25], ['g', 1 / 1000], 950],
  ['MER02', 'Massa esparguete', 'mer', 'kg', ['cx', 10], ['g', 1 / 1000], 1300],
  ['MER03', 'Fuba de milho', 'mer', 'kg', ['cx', 25], ['g', 1 / 1000], 500],
  ['MER04', 'Feijão manteiga', 'mer', 'kg', ['cx', 25], ['g', 1 / 1000], 1400],
  ['MER05', 'Farinha de trigo', 'mer', 'kg', ['cx', 25], ['g', 1 / 1000], 700],
  ['MER06', 'Óleo vegetal', 'mer', 'L', ['cx', 20], ['ml', 1 / 1000], 1600],
  ['MER07', 'Azeite', 'mer', 'L', ['cx', 6], ['ml', 1 / 1000], 6500],
  ['MER08', 'Sal', 'mer', 'kg', null, ['g', 1 / 1000], 300],
  ['MER09', 'Óleo de palma (dendém)', 'mer', 'L', ['cx', 20], ['ml', 1 / 1000], 1800],
  ['MER10', 'Polpa de tomate', 'mer', 'kg', ['cx', 12], ['g', 1 / 1000], 1700],
  ['MER11', 'Maionese', 'mer', 'kg', null, ['g', 1 / 1000], 3500],
  ['MER12', 'Ketchup', 'mer', 'kg', null, ['g', 1 / 1000], 3000],
  // Lacticínios e ovos
  ['LAC01', 'Manteiga', 'lac', 'kg', null, ['g', 1 / 1000], 7000],
  ['LAC02', 'Queijo flamengo fatiado', 'lac', 'kg', null, ['g', 1 / 1000], 8500],
  ['LAC03', 'Natas culinárias', 'lac', 'L', null, ['ml', 1 / 1000], 3200],
  ['LAC04', 'Ovos', 'lac', 'un', ['cx', 30], null, 90],
  // Padaria
  ['PAD01', 'Pão de hambúrguer', 'pad', 'un', null, null, 150],
  ['PAD02', 'Pão caseiro', 'pad', 'un', null, null, 60],
  // Limpeza (consumo interno)
  ['LIM01', 'Detergente da loiça 5L', 'lim', 'un', null, null, 4500, 0.15],
  ['LIM02', 'Lixívia 5L', 'lim', 'un', null, null, 2500, 0.1],
  ['LIM03', 'Desinfectante multiusos 5L', 'lim', 'un', null, null, 5200, 0.08],
  ['LIM04', 'Sacos do lixo 100L (rolo)', 'lim', 'un', null, null, 1800, 0.3],
  ['LIM05', 'Esfregões (pack 10)', 'lim', 'un', null, null, 1200, 0.1],
  ['LIM06', 'Rolo de papel de cozinha', 'lim', 'un', ['cx', 12], null, 700, 0.8],
  // Descartáveis
  ['DSC01', 'Guardanapos (pack 100)', 'dsc', 'un', ['cx', 30], null, 600, 1.5],
  ['DSC02', 'Palhinhas (pack 100)', 'dsc', 'un', null, null, 800, 0.3],
  ['DSC03', 'Copos de plástico (pack 50)', 'dsc', 'un', null, null, 900, 0.4],
  ['DSC04', 'Caixas take-away (pack 50)', 'dsc', 'un', ['cx', 10], null, 3500, 0.35],
  ['DSC05', 'Película aderente (rolo)', 'dsc', 'un', null, null, 2200, 0.06],
  ['DSC06', 'Papel de alumínio (rolo)', 'dsc', 'un', null, null, 2600, 0.06],
];

/** Fichas: [código, nome, preço (Kz), vendas/dia base, ingredientes [produto, qtd na unid. de consumo (ou stock)]] */
type R = [string, string, number, number, [string, number][]];
const resale = (code: string, name: string, price: number, perDay: number): R => [
  `V-${code}`,
  name,
  price,
  perDay,
  [[code, 1]],
];
const RECIPES: R[] = [
  resale('CER01', 'Cuca', 700, 26),
  resale('CER02', 'Nocal', 700, 14),
  resale('CER03', 'EKA', 650, 9),
  resale('CER04', "N'gola", 700, 10),
  resale('CER05', 'Heineken', 1300, 12),
  resale('CER06', 'Super Bock', 1200, 8),
  resale('CER07', 'Sagres', 1200, 6),
  resale('CER08', 'Castle Lite', 1100, 7),
  resale('REF01', 'Coca-Cola', 600, 18),
  resale('REF02', 'Coca-Cola Zero', 650, 7),
  resale('REF03', 'Fanta Laranja', 600, 9),
  resale('REF04', 'Sprite', 600, 6),
  resale('REF05', 'Pepsi', 600, 4),
  resale('REF06', '7Up', 600, 3),
  resale('REF07', 'Blue Laranja', 500, 6),
  resale('REF09', 'Red Bull', 1800, 4),
  resale('AGU01', 'Água 1,5L', 500, 10),
  resale('AGU02', 'Água 0,33L', 250, 22),
  resale('AGU03', 'Água com gás', 900, 6),
  resale('AGU04', 'Perrier', 1600, 2),
  ['V-SUMO', 'Sumo natural (copo)', 900, 8, [['REF10', 250]]],
  ['V-VCOPO', 'Copo de vinho tinto da casa', 1500, 9, [['VIN01', 150]]],
  ['V-VBCOPO', 'Copo de vinho branco da casa', 1500, 5, [['VIN06', 150]]],
  ['V-VDOURO', 'Garrafa vinho Douro reserva', 19000, 1, [['VIN02', 750]]],
  ['V-VVERDE', 'Garrafa vinho verde', 8500, 2, [['VIN03', 750]]],
  ['V-ESPUM', 'Garrafa espumante', 14000, 1, [['VIN05', 750]]],
  ['V-WRED', 'Whisky JW Red (dose)', 1800, 6, [['DES01', 40]]],
  ['V-WBLACK', 'Whisky JW Black (dose)', 3200, 3, [['DES02', 40]]],
  [
    'V-GINT',
    'Gin tónico',
    2800,
    7,
    [
      ['DES04', 50],
      ['REF08', 1],
      ['LEG08', 15],
    ],
  ],
  [
    'V-CAIPI',
    'Caipirinha',
    2500,
    5,
    [
      ['DES05', 50],
      ['LEG08', 40],
      ['CAF02', 2],
    ],
  ],
  ['V-AMARU', 'Amarula (dose)', 1800, 2, [['DES08', 40]]],
  [
    'V-CAFE',
    'Café expresso',
    400,
    35,
    [
      ['CAF01', 8],
      ['CAF02', 1],
    ],
  ],
  [
    'V-GALAO',
    'Galão',
    700,
    10,
    [
      ['CAF01', 8],
      ['CAF03', 200],
      ['CAF02', 1],
    ],
  ],
  [
    'V-CHA',
    'Chá',
    400,
    4,
    [
      ['CAF04', 1],
      ['CAF02', 1],
    ],
  ],
  // Pratos
  [
    'P-BIFE',
    'Bife com batata frita e ovo',
    6500,
    9,
    [
      ['CAR01', 250],
      ['LEG01', 300],
      ['MER06', 50],
      ['LAC04', 1],
    ],
  ],
  [
    'P-PICANHA',
    'Picanha grelhada com arroz e feijão',
    8500,
    7,
    [
      ['CAR02', 300],
      ['MER01', 100],
      ['MER04', 80],
      ['MER08', 5],
    ],
  ],
  [
    'P-FRANGO',
    'Frango grelhado com batata',
    4500,
    12,
    [
      ['CAR03', 500],
      ['LEG01', 300],
      ['LEG08', 30],
      ['MER06', 40],
    ],
  ],
  [
    'P-MUAMBA',
    'Muamba de galinha com funge',
    5000,
    8,
    [
      ['CAR03', 400],
      ['MER09', 50],
      ['LEG03', 10],
      ['LEG02', 50],
      ['MER03', 150],
    ],
  ],
  [
    'P-CALULU',
    'Calulu de peixe',
    5500,
    5,
    [
      ['PEI03', 350],
      ['MER09', 40],
      ['LEG04', 100],
      ['LEG02', 50],
      ['LEG11', 80],
    ],
  ],
  [
    'P-CACUSSO',
    'Cacusso grelhado com mandioca',
    4800,
    8,
    [
      ['PEI02', 400],
      ['LEG10', 250],
      ['LEG08', 30],
    ],
  ],
  [
    'P-GAROUPA',
    'Garoupa grelhada',
    7500,
    5,
    [
      ['PEI01', 350],
      ['LEG01', 250],
      ['MER07', 20],
    ],
  ],
  [
    'P-CAMARAO',
    'Camarão grelhado',
    9500,
    5,
    [
      ['PEI04', 300],
      ['LAC01', 20],
      ['LEG03', 10],
      ['MER01', 100],
    ],
  ],
  [
    'P-LULAS',
    'Lulas fritas',
    6000,
    4,
    [
      ['PEI05', 300],
      ['MER05', 30],
      ['MER06', 60],
      ['LEG08', 20],
    ],
  ],
  [
    'P-BACALHAU',
    'Bacalhau à casa',
    8000,
    3,
    [
      ['PEI06', 250],
      ['LEG01', 250],
      ['LEG02', 60],
      ['MER07', 40],
      ['LAC04', 1],
    ],
  ],
  [
    'P-HAMB',
    'Hambúrguer da casa',
    4500,
    11,
    [
      ['CAR07', 150],
      ['PAD01', 1],
      ['LAC02', 30],
      ['LEG05', 0.1],
      ['LEG04', 50],
      ['CAR09', 30],
      ['MER12', 20],
      ['MER11', 20],
      ['LEG01', 200],
      ['MER06', 40],
    ],
  ],
  [
    'P-BOLONH',
    'Esparguete à bolonhesa',
    4000,
    6,
    [
      ['MER02', 120],
      ['CAR07', 120],
      ['MER10', 80],
      ['LEG02', 30],
    ],
  ],
  [
    'P-FEIJOADA',
    'Feijoada',
    5000,
    5,
    [
      ['MER04', 150],
      ['CAR08', 50],
      ['CAR06', 150],
      ['MER01', 100],
      ['LEG07', 40],
    ],
  ],
  [
    'P-COSTEL',
    'Costeleta de porco grelhada',
    5200,
    4,
    [
      ['CAR05', 300],
      ['LEG01', 250],
      ['MER06', 40],
    ],
  ],
  [
    'P-SALADA',
    'Salada mista',
    2200,
    7,
    [
      ['LEG05', 0.3],
      ['LEG04', 100],
      ['LEG02', 30],
      ['MER07', 15],
    ],
  ],
  [
    'P-SOPA',
    'Sopa do dia',
    1500,
    12,
    [
      ['LEG01', 150],
      ['LEG07', 50],
      ['LEG11', 50],
      ['LEG02', 30],
      ['MER07', 10],
    ],
  ],
  [
    'P-PREGO',
    'Prego no pão',
    2800,
    9,
    [
      ['CAR01', 120],
      ['PAD02', 1],
      ['LAC01', 10],
    ],
  ],
  ['P-ANANAS', 'Ananás fatiado', 1500, 6, [['LEG12', 0.25]]],
  [
    'P-BANANA',
    'Banana-pão assada com mel',
    1800,
    4,
    [
      ['LEG09', 250],
      ['LAC01', 10],
    ],
  ],
];

// sazonalidade: dia da semana (0 = domingo) e unidade
const WEEKDAY = [1.3, 0.7, 0.75, 0.85, 0.95, 1.25, 1.45];
const unitFactor = (unit: number, dow: number) =>
  unit === 0 ? 1 : dow === 0 || dow === 6 ? 1.35 : 0.8; // Praia: fins-de-semana fortes

const WASTE_REASONS = [
  'Fora de validade',
  'Partido',
  'Mal confeccionado',
  'Derramado',
  'Estragado',
];

// ---------- execução ----------
const tenant = await prisma.tenant.findFirst({ where: { name: 'Restaurante Demo' } });
if (!tenant) throw new Error('Tenant "Restaurante Demo" não existe: corra primeiro db:seed');
const db = tenantDb(tenant.id);
const DONE_NOTE = 'Inventário semanal do bar (demonstração)';
if (await db.inventoryCount.findFirst({ where: { notes: DONE_NOTE } })) {
  console.log('Os dados de demonstração já estão completos. Nada a fazer.');
  process.exit(0);
}
const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@demo.local' } });
const auth: AuthContext = { ...(await systemAuth(tenant.id)), userId: admin.id };
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

// unidades de medida
const mu = new Map((await db.measureUnit.findMany()).map((u) => [u.symbol, u.id]));
const unitId = (sym: string) => {
  const id = mu.get(sym);
  if (!id) throw new Error(`Unidade de medida ${sym} em falta`);
  return id;
};

// estrutura
const units = await db.unit.findMany({
  where: { active: true },
  orderBy: { name: 'asc' },
  include: { locations: true },
});
if (units.length < 2) throw new Error('São precisas 2 unidades (seed)');
const loc = (u: (typeof units)[number], type: string) =>
  u.locations.find((l) => l.type === type)!.id;

// categorias
const catIds = new Map<Cat, string>();
const parents = new Map<string, string>();
for (const [key, c] of Object.entries(CATS) as [Cat, (typeof CATS)[Cat]][]) {
  let parentId = parents.get(c.parent);
  if (!parentId) {
    parentId = (
      (await db.category.findFirst({ where: { name: c.parent, parentId: null } })) ??
      (await db.category.create({ data: { name: c.parent } }))
    ).id;
    parents.set(c.parent, parentId);
  }
  const sub =
    c.name === c.parent
      ? parentId
      : (
          (await db.category.findFirst({ where: { name: c.name, parentId } })) ??
          (await db.category.create({ data: { name: c.name, parentId } }))
        ).id;
  catIds.set(key, sub);
}
// locais de saída das vendas: Bebidas → Bar, Alimentos → Cozinha
for (const u of units) {
  for (const [parent, type] of [
    ['Bebidas', 'BAR'],
    ['Alimentos', 'KITCHEN'],
  ] as const) {
    await db.categoryOutputLocation.deleteMany({
      where: { categoryId: parents.get(parent)!, unitId: u.id },
    });
    await db.categoryOutputLocation.create({
      data: { categoryId: parents.get(parent)!, unitId: u.id, locationId: loc(u, type) },
    });
  }
}
for (const name of WASTE_REASONS)
  await db.wasteReason.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name } },
    update: {},
    create: { name },
  });

// fornecedores
const supIds = new Map<string, string>();
for (const [key, s] of Object.entries(SUPPLIERS)) {
  const sup =
    (await db.supplier.findFirst({ where: { name: s.name } })) ??
    (await db.supplier.create({
      data: {
        name: s.name,
        paymentTermDays: s.terms,
        nif: `5${String(Math.floor(rnd() * 1e8)).padStart(9, '0')}`,
        phone: `+2449${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`,
      },
    }));
  supIds.set(key, sup.id);
}

// produtos (+ conversões, mínimos/máximos, preço no fornecedor)
type Prod = {
  id: string;
  code: string;
  cat: Cat;
  stockUnit: string;
  purchase: [string, number] | null;
  cost: number;
  baseUse: number;
  supplier: string;
  location: 'BAR' | 'KITCHEN' | 'WAREHOUSE';
};
const prods = new Map<string, Prod>();
for (const [code, name, cat, su, purchase, consumption, cost, baseUse] of PRODUCTS) {
  const supplier = CATS[cat].sup;
  const existing = await db.product.findFirst({ where: { code } });
  const p =
    existing ??
    (await db.product.create({
      data: {
        code,
        name,
        categoryId: catIds.get(cat)!,
        stockUnitId: unitId(su),
        purchaseUnitId: purchase ? unitId(purchase[0]) : null,
        consumptionUnitId: consumption ? unitId(consumption[0]) : null,
        preferredSupplierId: supIds.get(supplier)!,
      },
    }));
  const conv = [purchase, consumption].filter(Boolean) as [string, number][];
  if (conv.length && !existing)
    await db.productUnitConversion.createMany({
      data: conv.map(([sym, factor]) => ({ productId: p.id, unitId: unitId(sym), factor })),
    });
  if (!existing)
    await db.supplierProduct
      .create({
        data: {
          supplierId: supIds.get(supplier)!,
          productId: p.id,
          lastPrice: Math.round(cost * (purchase?.[1] ?? 1)),
        },
      })
      .catch(() => undefined);
  const parent = CATS[cat].parent;
  prods.set(code, {
    id: p.id,
    code,
    cat,
    stockUnit: su,
    purchase,
    cost,
    baseUse: baseUse ?? 0,
    supplier,
    location: parent === 'Bebidas' ? 'BAR' : parent === 'Alimentos' ? 'KITCHEN' : 'WAREHOUSE',
  });
}
log(`${prods.size} artigos, ${supIds.size} fornecedores`);

// fichas técnicas + mapeamento do POS
const profile =
  (await db.importProfile.findFirst({ where: { name: 'POS demo (vendas por artigo)' } })) ??
  (await db.importProfile.create({
    data: {
      name: 'POS demo (vendas por artigo)',
      posName: 'POSDEMO',
      columns: {
        itemCode: 'Código',
        itemName: 'Artigo',
        qty: 'Quantidade',
        amount: 'Valor',
        date: 'Data',
      },
      dateFormat: 'DD/MM/YYYY',
      decimalSeparator: ',',
    },
  }));
for (const [code, name, price, , lines] of RECIPES) {
  if (await db.saleItem.findFirst({ where: { code } })) continue;
  const si = await db.saleItem.create({ data: { code, name, salePrice: price } });
  await db.recipeLine.createMany({
    data: lines.map(([pc, qty]) => {
      const p = PRODUCTS.find((x) => x[0] === pc)!;
      return {
        saleItemId: si.id,
        productId: prods.get(pc)!.id,
        qty,
        unitId: p[5] ? unitId(p[5][0]) : null,
      };
    }),
  });
  await db.posItemMapping.create({
    data: { posName: 'POSDEMO', posCode: code, posLabel: name, saleItemId: si.id },
  });
}
log(`${RECIPES.length} fichas técnicas`);

// uso diário médio previsto por produto (unid. de stock) e unidade, a partir das vendas base
const book = await loadRecipeBook(db);
const saleItemIds = new Map(
  (await db.saleItem.findMany({ select: { id: true, code: true } })).map((s) => [s.code, s.id]),
);
const avgUse = new Map<string, number>(); // productId → uso médio/dia (unidade de referência)
for (const [code, , , perDay] of RECIPES)
  for (const [pid, q] of explode(book, saleItemIds.get(code)!, new Prisma.Decimal(perDay)))
    avgUse.set(pid, (avgUse.get(pid) ?? 0) + q.toNumber());
for (const p of prods.values()) if (p.baseUse) avgUse.set(p.id, p.baseUse);

// mínimos/máximos por local (dias de cobertura)
for (const u of units)
  for (const p of prods.values()) {
    const use = avgUse.get(p.id) ?? 0;
    if (!use) continue;
    await db.productLocationLimit.createMany({
      data: [
        {
          productId: p.id,
          locationId: loc(u, p.location),
          minQty: Math.max(1, Math.ceil(use * 3)),
          maxQty: Math.ceil(use * 25),
        },
      ],
      skipDuplicates: true,
    });
  }

// ---------- simulação dia a dia ----------
const today = todayLocal();
const start = addDays(today, -DAYS);
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`); // hora de Luanda
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const balance = async (productId: string, locationId: string) =>
  (
    await db.stockBalance.findUnique({ where: { productId_locationId: { productId, locationId } } })
  )?.qty.toNumber() ?? 0;

/** Recepção por fornecedor: repõe cada produto até `cover` dias de uso, na unidade de compra. */
async function restock(u: (typeof units)[number], day: string, cover: number) {
  const inflation = 1 + 0.0015 * (DAYS - Math.round((Date.parse(today) - Date.parse(day)) / 864e5));
  const bySupplier = new Map<
    string,
    { productId: string; unitId: string; qty: number; unitPrice: number }[]
  >();
  for (const p of prods.values()) {
    const use = avgUse.get(p.id) ?? 0;
    if (!use) continue;
    const factor = unitFactor(units.indexOf(u), 6);
    const need = use * factor * cover - (await balance(p.id, loc(u, p.location)));
    if (need <= use) continue;
    const [pu, f] = p.purchase ?? [p.stockUnit, 1];
    const qty = Math.ceil(need / f);
    const unitPrice = Math.round(p.cost * f * inflation * noise(0.03));
    const list = bySupplier.get(p.supplier) ?? [];
    list.push({ productId: p.id, unitId: unitId(pu), qty, unitPrice });
    bySupplier.set(p.supplier, list);
  }
  for (const [sup, lines] of bySupplier) {
    for (const locType of ['BAR', 'KITCHEN', 'WAREHOUSE'] as const) {
      const ls = lines.filter(
        (l) => [...prods.values()].find((p) => p.id === l.productId)!.location === locType,
      );
      if (!ls.length) continue;
      await createReceipt(auth, {
        supplierId: supIds.get(sup)!,
        locationId: loc(u, locType),
        orderId: null,
        invoiceNumber: `FT ${day.replaceAll('-', '')}/${Math.floor(rnd() * 900 + 100)}`,
        invoiceDate: new Date(day),
        receivedAt: at(day, '09:30'),
        attachmentUrl: null,
        attachmentName: null,
        notes: null,
        lines: ls.map((l) => ({ ...l, orderLineId: null, lotCode: null, expiryDate: null })),
      } as never);
    }
  }
}

/** Ficheiro de vendas do dia (formato do perfil POSDEMO) → importação → confirmação. */
async function sales(u: (typeof units)[number], day: string, ui: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vendas');
  ws.addRow(['Código', 'Artigo', 'Quantidade', 'Valor', 'Data']);
  const d = `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  for (const [code, name, price, perDay] of RECIPES) {
    const q = Math.round(perDay * WEEKDAY[dow(day)]! * unitFactor(ui, dow(day)) * noise(0.3));
    if (q > 0) ws.addRow([code, name, q, q * price, d]);
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const imp = await createImport(
    auth,
    { unitId: u.id, profileId: profile.id, saleDate: day },
    { buffer, filename: fileName(u, day) },
  );
  if (imp.status !== 'READY') {
    log(`vendas ${u.name} ${day} saltadas (já há uma importação para este dia)`);
    return;
  }
  await confirmImport(auth, imp.id);
}
const fileName = (u: (typeof units)[number], day: string) =>
  `vendas-${u.name.replace(/\W+/g, '-')}-${day}.xlsx`;
/** dia já simulado numa corrida anterior (retoma) */
const simulated = async (u: (typeof units)[number], day: string) =>
  Boolean(
    await db.salesImport.findFirst({
      where: { fileName: fileName(u, day), status: { in: ['CONFIRMED', 'FAILED'] } },
    }),
  );

/** Quebras e consumos internos do dia. */
async function shrinkage(u: (typeof units)[number], day: string) {
  const inputs: MovementInput[] = [];
  const food = [...prods.values()].filter(
    (p) => p.location !== 'WAREHOUSE' && (avgUse.get(p.id) ?? 0) > 0,
  );
  for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) {
    const p = pick(food);
    const use = avgUse.get(p.id)!;
    const qty = Math.max(
      p.stockUnit === 'kg' || p.stockUnit === 'L' ? 0.1 : 1,
      +(use * (0.05 + rnd() * 0.25)).toFixed(p.stockUnit === 'kg' || p.stockUnit === 'L' ? 2 : 0),
    );
    if (qty > (await balance(p.id, loc(u, p.location)))) continue;
    inputs.push({
      productId: p.id,
      locationId: loc(u, p.location),
      type: 'WASTE',
      qty,
      reason: pick(WASTE_REASONS),
    });
  }
  for (const p of prods.values()) {
    if (!p.baseUse || rnd() > 0.5) continue;
    const qty = Math.max(1, Math.round(p.baseUse * 2 * noise(0.5)));
    if (qty > (await balance(p.id, loc(u, 'WAREHOUSE')))) continue;
    inputs.push({
      productId: p.id,
      locationId: loc(u, 'WAREHOUSE'),
      type: 'CONSUMPTION',
      qty,
      reason: 'Uso diário',
    });
  }
  if (inputs.length)
    await db.$transaction((tx) =>
      postMovements(tx, inputs, {
        tenantId: tenant!.id,
        userId: admin.id,
        occurredAt: at(day, '22:30'),
      }),
    );
}

for (let i = 0; i < DAYS; i++) {
  const day = addDays(start, i);
  for (const [ui, u] of units.entries()) {
    if (await simulated(u, day)) continue;
    if (i === 0) await restock(u, day, 21);
    else if (dow(day) === 1 || dow(day) === 4) await restock(u, day, 10); // segundas e quintas
    await sales(u, day, ui);
    await shrinkage(u, day);
  }
  if (i % 10 === 9) log(`dia ${i + 1}/${DAYS} (${day})`);
}

// anomalia para demonstração: ontem, avaria de frio na Praia → quebra grande de marisco
if (
  !(await db.stockMovement.findFirst({
    where: { type: 'WASTE', occurredAt: at(addDays(today, -1), '23:00') },
  }))
) {
  const u = units[1]!;
  const yesterday = addDays(today, -1);
  const inputs: MovementInput[] = [];
  for (const code of ['PEI04', 'PEI01', 'PEI05']) {
    const p = prods.get(code)!;
    const qty = +((await balance(p.id, loc(u, 'KITCHEN'))) * 0.8).toFixed(2);
    if (qty > 0)
      inputs.push({
        productId: p.id,
        locationId: loc(u, 'KITCHEN'),
        type: 'WASTE',
        qty,
        reason: 'Estragado',
      });
  }
  if (inputs.length)
    await db.$transaction((tx) =>
      postMovements(tx, inputs, {
        tenantId: tenant!.id,
        userId: admin.id,
        occurredAt: at(yesterday, '23:00'),
      }),
    );
  log('anomalia de quebras criada (ontem, Unidade Praia)');
}

// transferências de hoje: Armazém Centro → Cozinha Centro (recebida) e → Armazém Praia (enviada)
if (!(await db.transfer.findFirst({ where: { notes: 'Empréstimo entre unidades' } }))) {
  const [c, pr] = units as [(typeof units)[number], (typeof units)[number]];
  const items = ['LIM04', 'DSC01', 'LIM06'].map((code) => prods.get(code)!);
  const t1 = await createTransfer(auth, {
    fromLocationId: loc(c, 'WAREHOUSE'),
    toLocationId: loc(c, 'KITCHEN'),
    notes: 'Reposição da cozinha',
    lines: items.map((p) => ({ productId: p.id, qty: 2, unitId: null })),
  } as never);
  await sendTransfer(auth, t1.id);
  const sent = await db.transferLine.findMany({ where: { transferId: t1.id } });
  await receiveTransfer(auth, t1.id, {
    lines: sent.map((l, i) => ({ lineId: l.id, receivedQty: i === 0 ? 1 : l.sentQty!.toNumber() })),
  });
  const t2 = await createTransfer(auth, {
    fromLocationId: loc(c, 'WAREHOUSE'),
    toLocationId: loc(pr, 'WAREHOUSE'),
    notes: 'Empréstimo entre unidades',
    lines: [{ productId: prods.get('DSC04')!.id, qty: 1, unitId: null }],
  } as never);
  await sendTransfer(auth, t2.id);
  log('transferências criadas');
}

// inventário de hoje ao Bar de cada unidade, com alguns desvios
for (const u of units) {
  const count = await openCount(auth, {
    locationId: loc(u, 'BAR'),
    categoryId: null,
    blocksMovements: false,
    notes: DONE_NOTE,
  });
  const lines = await db.inventoryCountLine.findMany({ where: { countId: count.id } });
  // o teórico só é gravado no fecho: a referência é o saldo actual no local
  const bal = new Map(
    (await db.stockBalance.findMany({ where: { locationId: loc(u, 'BAR') } })).map((b) => [
      b.productId,
      b.qty.toNumber(),
    ]),
  );
  await saveCounts(auth, count.id, {
    lines: lines.map((l) => {
      const exp = bal.get(l.productId) ?? 0;
      const whole = Number.isInteger(exp);
      // ~15% das linhas com falta pequena (1 un. ou 3–8% nas quantidades a peso/volume), raras sobras
      const r = rnd();
      const diff =
        r < 0.15 ? -(whole ? 1 : exp * (0.03 + rnd() * 0.05)) : r < 0.18 ? (whole ? 1 : 0) : 0;
      return { productId: l.productId, countedQty: Math.max(0, +(exp + diff).toFixed(3)) };
    }),
  });
  await closeCount(auth, count.id);
}
log('inventários fechados');

// alertas: mínimos de todos os produtos + varrimento (validades, importações, etc.)
const pairs = await db.stockBalance.findMany({ select: { productId: true, locationId: true } });
await evaluateStock(db, tenant.id, pairs);
await sweepTenant(tenant.id);

const [mv, imports, receipts] = await Promise.all([
  db.stockMovement.count(),
  db.salesImport.count({ where: { status: 'CONFIRMED' } }),
  db.goodsReceipt.count(),
]);
log(`Concluído: ${mv} movimentos, ${receipts} recepções, ${imports} importações de vendas.`);
await prisma.$disconnect();
