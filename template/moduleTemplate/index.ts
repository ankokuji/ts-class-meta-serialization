import {A} from "./export";

type ds = string | A

@Component
class M {
  @Inject
  private ha!: ds
}