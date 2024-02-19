import {
  Context,
  DAL,
  ITaxModuleService,
  InternalModuleDeclaration,
  ModuleJoinerConfig,
  ModulesSdkTypes,
  TaxTypes,
} from "@medusajs/types"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  ModulesSdkUtils,
} from "@medusajs/utils"
import {
  TaxRate,
  TaxRegion,
  ProductTaxRate,
  ShippingTaxRate,
  ProductTypeTaxRate,
} from "@models"
import { entityNameToLinkableKeysMap, joinerConfig } from "../joiner-config"
import { TaxRegionDTO } from "@medusajs/types"

type InjectedDependencies = {
  baseRepository: DAL.RepositoryService
  taxRateService: ModulesSdkTypes.InternalModuleService<any>
  taxRegionService: ModulesSdkTypes.InternalModuleService<any>
  productTypeTaxRateService: ModulesSdkTypes.InternalModuleService<any>
  productTaxRateService: ModulesSdkTypes.InternalModuleService<any>
  shippingTaxRateService: ModulesSdkTypes.InternalModuleService<any>
}

const generateForModels = [
  TaxRegion,
  ProductTaxRate,
  ProductTypeTaxRate,
  ShippingTaxRate,
]

export default class TaxModuleService<
    TTaxRate extends TaxRate = TaxRate,
    TTaxRegion extends TaxRegion = TaxRegion,
    TProductTaxRate extends ProductTaxRate = ProductTaxRate,
    TProductTypeTaxRate extends ProductTypeTaxRate = ProductTypeTaxRate,
    TShippingTaxRate extends ShippingTaxRate = ShippingTaxRate
  >
  extends ModulesSdkUtils.abstractModuleServiceFactory<
    InjectedDependencies,
    TaxTypes.TaxRateDTO,
    {
      TaxRegion: { dto: TaxTypes.TaxRegionDTO }
      ShippingTaxRate: { dto: TaxTypes.ShippingTaxRateDTO }
      ProductTaxRate: { dto: TaxTypes.ProductTaxRateDTO }
      ProductTypeTaxRate: { dto: TaxTypes.ProductTypeTaxRateDTO }
    }
  >(TaxRate, generateForModels, entityNameToLinkableKeysMap)
  implements ITaxModuleService
{
  protected baseRepository_: DAL.RepositoryService
  protected taxRateService_: ModulesSdkTypes.InternalModuleService<TTaxRate>
  protected taxRegionService_: ModulesSdkTypes.InternalModuleService<TTaxRegion>
  protected productTypeTaxRateService_: ModulesSdkTypes.InternalModuleService<TProductTypeTaxRate>
  protected productTaxRateService_: ModulesSdkTypes.InternalModuleService<TProductTaxRate>
  protected shippingTaxRateService_: ModulesSdkTypes.InternalModuleService<TShippingTaxRate>

  constructor(
    {
      baseRepository,
      taxRateService,
      taxRegionService,
      productTypeTaxRateService,
      productTaxRateService,
      shippingTaxRateService,
    }: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    // @ts-ignore
    super(...arguments)

    this.baseRepository_ = baseRepository
    this.taxRateService_ = taxRateService
    this.taxRegionService_ = taxRegionService
    this.productTypeTaxRateService_ = productTypeTaxRateService
    this.productTaxRateService_ = productTaxRateService
    this.shippingTaxRateService_ = shippingTaxRateService
  }

  __joinerConfig(): ModuleJoinerConfig {
    return joinerConfig
  }

  async create(
    data: TaxTypes.CreateTaxRateDTO[],
    sharedContext?: Context
  ): Promise<TaxTypes.TaxRateDTO[]>

  async create(
    data: TaxTypes.CreateTaxRateDTO,
    sharedContext?: Context
  ): Promise<TaxTypes.TaxRateDTO>

  @InjectManager("baseRepository_")
  async create(
    data: TaxTypes.CreateTaxRateDTO[] | TaxTypes.CreateTaxRateDTO,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<TaxTypes.TaxRateDTO[] | TaxTypes.TaxRateDTO> {
    const input = Array.isArray(data) ? data : [data]
    const rates = await this.create_(input, sharedContext)
    const result = await this.baseRepository_.serialize<TaxTypes.TaxRateDTO>(
      rates,
      { populate: true }
    )
    return Array.isArray(data) ? result : result[0]
  }

  @InjectTransactionManager("baseRepository_")
  protected async create_(
    data: TaxTypes.CreateTaxRateDTO[],
    @MedusaContext() sharedContext: Context = {}
  ) {
    return await this.taxRateService_.create(data, sharedContext)
  }

  async createTaxRegions(
    data: TaxTypes.CreateTaxRegionDTO[],
    @MedusaContext() sharedContext: Context = {}
  ): Promise<TaxTypes.TaxRegionDTO[]> {
    // TODO: check that country_code === parent.country_code
    const [defaultRates, regionData] = data.reduce(
      (acc, region) => {
        const { default_tax_rate, ...rest } = region
        acc[0].push({
          ...default_tax_rate,
          is_default: true,
          created_by: region.created_by,
        })
        acc[1].push(rest)
        return acc
      },
      [[], []] as [
        Omit<TaxTypes.CreateTaxRateDTO, "tax_region_id">[],
        Partial<TaxTypes.CreateTaxRegionDTO>[]
      ]
    )

    const regions = await this.taxRegionService_.create(
      regionData,
      sharedContext
    )

    const rates = regions.map((region: TaxRegionDTO, i: number) => {
      return {
        ...defaultRates[i],
        tax_region_id: region.id,
      }
    })

    await this.create(rates, sharedContext)

    return await this.baseRepository_.serialize<TaxTypes.TaxRegionDTO[]>(
      regions,
      {
        populate: true,
      }
    )
  }

  async createShippingTaxRates(
    data: TaxTypes.CreateShippingTaxRateDTO[],
    @MedusaContext() sharedContext: Context = {}
  ): Promise<TaxTypes.ShippingTaxRateDTO[]> {
    return await this.createTaxRule_<
      TaxTypes.CreateShippingTaxRateDTO,
      TaxTypes.ShippingTaxRateDTO
    >("shipping_option_id", this.shippingTaxRateService_, data, sharedContext)
  }

  async createProductTaxRates(
    data: TaxTypes.CreateProductTaxRateDTO[],
    @MedusaContext() sharedContext: Context = {}
  ): Promise<TaxTypes.ProductTaxRateDTO[]> {
    return await this.createTaxRule_<
      TaxTypes.CreateProductTaxRateDTO,
      TaxTypes.ProductTaxRateDTO
    >("product_id", this.productTaxRateService_, data, sharedContext)
  }

  async createProductTypeTaxRates(
    data: TaxTypes.CreateProductTypeTaxRateDTO[],
    @MedusaContext() sharedContext: Context = {}
  ): Promise<TaxTypes.ProductTypeTaxRateDTO[]> {
    return await this.createTaxRule_<
      TaxTypes.CreateProductTypeTaxRateDTO,
      TaxTypes.ProductTypeTaxRateDTO
    >("product_type_id", this.productTypeTaxRateService_, data, sharedContext)
  }

  private async createTaxRule_<
    T extends {
      tax_rate: Omit<TaxTypes.CreateTaxRateDTO, "is_default">
      [key: string]: any
    },
    K
  >(
    ruleKey: string,
    service: ModulesSdkTypes.InternalModuleService<any>,
    data: T[],
    @MedusaContext() sharedContext: Context = {}
  ) {
    const [ruleIds, rates] = data.reduce(
      (acc, rate) => {
        acc[0].push(rate[ruleKey])
        acc[1].push(rate.tax_rate)
        return acc
      },
      [[], []] as [string[], TaxTypes.CreateTaxRateDTO[]]
    )

    const taxRates = await this.create(rates, sharedContext)
    const result = await service.create(
      taxRates.map((rate, i) => {
        return {
          [ruleKey]: ruleIds[i],
          tax_rate_id: rate.id,
        }
      }),
      sharedContext
    )
    return await this.baseRepository_.serialize<K[]>(result, { populate: true })
  }
}
