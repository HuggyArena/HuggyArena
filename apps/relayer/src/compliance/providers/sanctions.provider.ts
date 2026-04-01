import { Injectable, Logger } from '@nestjs/common';

export type SanctionsScreeningResult = {
  address: string;
  risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';
  categories: string[];
  entities: string[];
};

@Injectable()
export class SanctionsProvider {
  private readonly logger = new Logger(SanctionsProvider.name);
  private readonly provider = (process.env.SANCTIONS_PROVIDER || 'TRM') as 'TRM' | 'CHAINALYSIS';
  private readonly apiKey = process.env.TRM_API_KEY || process.env.CHAINALYSIS_API_KEY || '';
  private readonly baseUrl =
    this.provider === 'TRM' ? 'https://api.trmlabs.com/public/v1' : 'https://api.chainalysis.com/api/v1';

  get providerName() {
    return this.provider;
  }

  async screenAddress(address: string): Promise<SanctionsScreeningResult> {
    return this.provider === 'TRM' ? this.screenTRM(address) : this.screenChainalysis(address);
  }

  async batchScreen(addresses: string[]) {
    return Promise.all(addresses.map((address) => this.screenAddress(address)));
  }

  private async screenTRM(address: string): Promise<SanctionsScreeningResult> {
    try {
      const response = await fetch(`${this.baseUrl}/screening/addresses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address, network: 'polygon' }),
      });
      const trmApiResponse: any = await response.json();
      return {
        address,
        risk: trmApiResponse?.riskScore > 70 ? 'HIGH' : trmApiResponse?.riskScore > 30 ? 'MEDIUM' : 'NONE',
        categories: trmApiResponse?.flags?.map((flag: any) => flag.type) || [],
        entities: trmApiResponse?.identifiedEntities || [],
      };
    } catch (error) {
      this.logger.error(`TRM screening failed for ${address}`, error as any);
      return { address, risk: 'HIGH', categories: ['SCREENING_ERROR'], entities: [] };
    }
  }

  private async screenChainalysis(address: string): Promise<SanctionsScreeningResult> {
    try {
      const response = await fetch(`${this.baseUrl}/sanctions/screening`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address }),
      });
      const chainalysisApiResponse: any = await response.json();
      return {
        address,
        risk: chainalysisApiResponse?.sanctions?.length ? 'SEVERE' : 'NONE',
        categories: chainalysisApiResponse?.identifications?.map((identification: any) => identification.category) || [],
        entities: chainalysisApiResponse?.identifications?.map((identification: any) => identification.entity) || [],
      };
    } catch (error) {
      this.logger.error(`Chainalysis screening failed for ${address}`, error as any);
      return { address, risk: 'HIGH', categories: ['SCREENING_ERROR'], entities: [] };
    }
  }
}
