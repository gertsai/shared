import { $lexoRank } from './instance';

export class OrderRank {
  private _order_rank: string;

  constructor({ order_rank }: { order_rank: string }) {
    this._order_rank = order_rank;
  }

  get next() {
    return $lexoRank.next(this._order_rank);
  }

  get prev() {
    return $lexoRank.prev(this._order_rank);
  }

  get middle() {
    return $lexoRank.middle(this._order_rank);
  }

  get order_rank() {
    return this._order_rank;
  }
}
