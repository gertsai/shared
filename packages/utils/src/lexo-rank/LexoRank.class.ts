export class LexoRank {
  static readonly #CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
  readonly #SEG_SIZE: number = 6;
  readonly #STEP_SIZE: number = 8;
  readonly #randomize: boolean = false;

  constructor({ randomize = false, stepSize = 8 }) {
    this.#randomize = randomize;
    this.#STEP_SIZE = stepSize;
  }

  get #MIN_CHAR() {
    return LexoRank.#CHARS[0];
  }

  // get #MAX_CHAR() {
  //   return LexoRank.#CHARS[LexoRank.#CHARS.length - 1];
  // }

  get #MIN_SEGMENT() {
    return 0;
  }

  get #MAX_SEGMENT() {
    return LexoRank.#CHARS.length ** 6 - 1;
  }

  /**
   * Returns middle or sibling rank
   * @param prev
   * @param next
   */
  middleOrSibling(prev: string | null = null, next: string | null = null) {
    if (!prev && !next) {
      return this.middle(prev, next);
    }

    if (!prev && next) {
      return this.prev(next);
    }

    if (!next && prev) {
      return this.next(prev);
    }

    return this.middle(prev, next);
  }

  /**
   * @param {String} prev
   * @param {String} next
   * @returns {String}
   */
  middle(prev: string | null = null, next: string | null = null) {
    if (!prev) {
      prev = this.#numToStr(this.#MIN_SEGMENT);
    }

    if (!next) {
      next = this.#numToStr(this.#MAX_SEGMENT);
    }

    if (next < prev) {
      throw new Error('Next rank is bigger than previous');
    }

    if (next === prev) {
      throw new Error('Next rank is equal to previous');
    }

    const prevSegments = this.#parse(prev);
    const nextSegments = this.#parse(next);

    const newSegments = [];

    // oxlint-disable-next-line no-constant-condition
    for (let i = 0; true; i++) {
      const prevSegment =
        i < prevSegments.length
          ? (prevSegments[i] as number)
          : this.#MIN_SEGMENT;
      const nextSegment =
        i < nextSegments.length
          ? (nextSegments[i] as number)
          : this.#MAX_SEGMENT;

      if (prevSegment === nextSegment) {
        newSegments.push(prevSegment);
        continue;
      }

      const midSegment =
        this.#mid(prevSegment, nextSegment) +
        (this.#randomize
          ? Math.random() * (nextSegment - prevSegment) -
            (nextSegment - prevSegment) / 2
          : 0);

      if (midSegment % 1 === 0) {
        // Если средний сегмент - целое число
        newSegments.push(midSegment);
        break;
      }

      if (nextSegments.length > i + 1) {
        newSegments.push(Math.ceil(midSegment));
        break;
      }

      const segment = Math.floor(midSegment);

      newSegments.push(segment);

      if (segment !== 0 && (!prevSegments[i] || prevSegment !== segment)) {
        break;
      }
    }

    const middleRank = this.#make(newSegments);

    /* c8 ignore next 6 */
    if (middleRank <= prev || middleRank >= next) {
      // Should never happen
      throw new Error(
        ['New rank <= prev or >= next', prev, middleRank, next].join(' '),
      );
    }

    return middleRank;
  }

  /**
   * Returns previous lexorank from given
   * @param {String} rank
   * @returns {String}
   */
  prev(rank: string) {
    const segments = this.#parse(rank);

    if (segments.filter(Boolean).length === 0) {
      return this.#make([this.#MIN_SEGMENT]);
    }

    const newSegments = [];

    // oxlint-disable-next-line no-constant-condition
    for (let i = 0; true; i++) {
      const segment =
        i < segments.length ? (segments[i] as number) : this.#MAX_SEGMENT;
      const newValue =
        segment -
        this.#STEP_SIZE -
        (this.#randomize ? Math.ceil(this.#STEP_SIZE * Math.random()) : 0);

      if (newValue > 0) {
        newSegments.push(newValue);
        break;
      }

      newSegments.push(this.#MIN_SEGMENT);
    }

    return this.#make(newSegments);
  }

  /**
   * Returns next lexorank from given
   * @param {String} rank
   * @returns {String}
   */
  next(rank: string) {
    const segments = this.#parse(rank);

    const newSegments = [];

    // oxlint-disable-next-line no-constant-condition
    for (let i = 0; true; i++) {
      const segment =
        i < segments.length ? (segments[i] as number) : this.#MIN_SEGMENT;
      const newValue =
        segment +
        this.#STEP_SIZE +
        (this.#randomize ? Math.ceil(this.#STEP_SIZE * Math.random()) : 0);

      if (newValue < this.#MAX_SEGMENT) {
        newSegments.push(newValue);
        break;
      }

      newSegments.push(this.#MAX_SEGMENT - 1);
    }

    return this.#make(newSegments);
  }

  /**
   * @param {String} rank
   * @returns {String}
   */
  nextOrMiddle(rank: string | undefined) {
    return rank ? this.next(rank) : this.middle();
  }

  /**
   * @param {String} rank
   * @returns {String}
   */
  prevOrMiddle(rank: string | undefined) {
    return rank ? this.prev(rank) : this.middle();
  }

  /**
   * Returns random lexoRank
   * @returns {String}
   */
  random() {
    return this.#make([Math.floor(Math.random() * 36 ** 6)]);
  }

  /**
   * Converts number to LexoRank
   * @param num
   */
  fromNumber(num: number) {
    // If number is bigger than max segment, split number to segments
    if (num > this.#MAX_SEGMENT) {
      const segments = [];
      let rest = num;
      while (rest > 0) {
        segments.push(rest % this.#MAX_SEGMENT);
        rest = Math.floor(rest / this.#MAX_SEGMENT);
      }
      return this.#make(segments.reverse());
    }
    return this.#make([num]);
  }

  /**
   * Returns middle number for two given
   * @param {Number} prev
   * @param {Number} next
   * @returns {Number}
   */
  #mid(prev: number, next: number) {
    return (prev + next) / 2;
  }

  /**
   * Converts lexorank to array of number segments
   * @param {String} rank
   * @returns {Array}
   */
  #parse(rank: string): number[] {
    return rank
      .split(':')
      .filter(Boolean)
      .map((s) => this.#strToNum(s.padEnd(this.#SEG_SIZE, this.#MIN_CHAR)));
  }

  /**
   * Makes lexorank from given number segments
   * @param {Array} segments
   * @returns {String}
   */
  #make(segments: number[]) {
    return segments
      .map((s, i, arr) => {
        const segStr = this.#numToStr(s);

        if (i !== 0 && i === arr.length - 1) {
          return segStr.replace(/0+$/, '');
        }

        return segStr + ':';
      })
      .join('');
  }

  #numToStr(number: number) {
    let str = '';

    do {
      str = LexoRank.#CHARS[number % LexoRank.#CHARS.length] + str;
      number = Math.floor(number / LexoRank.#CHARS.length);
    } while (number > 0);

    return str.padStart(this.#SEG_SIZE, '0');
  }

  #strToNum(str: string) {
    let sum = 0;

    for (let i = 0; i < str.length; i++) {
      sum +=
        LexoRank.#CHARS.indexOf(str[i] as string) *
        Math.pow(LexoRank.#CHARS.length, str.length - i - 1);
    }

    return sum;
  }
}
