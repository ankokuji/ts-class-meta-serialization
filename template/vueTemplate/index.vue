<template>
  
</template>

<script lang="ts">
import Vue from 'vue'
import {Data} from "./utils"

@Component
export class Com extends Vue {
  @Prop({
    title: "a",
    content: "jkldsdjks",
    length: 8
  })
  private data1?: string = "123"
}
</script>
