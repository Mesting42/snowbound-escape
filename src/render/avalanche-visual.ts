import * as THREE from "three";
import { random } from "../core/math";
import type { avalancheFeedback } from "../systems/avalanche-feedback";

const foamGeometry = new THREE.SphereGeometry(1, 12, 8);
/** 雪浪前沿始终在局部x=0，其余体积向身后展开，不钳制到屏幕边缘。 */
export class AvalancheVisual {
  front = new THREE.Group();
  mist: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  constructor() {
    const shades = ["#e2eeee", "#a4bfc9", "#c2d6dc"].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    for (let i = 0; i < 30; i++) {
      const radius = 2.2 + random(13, i) * 2.8;
      const cloud = new THREE.Mesh(foamGeometry, shades[i % 3]);
      cloud.scale.set(radius, 2.4 + random(29, i) * 2.4, 3.5);
      cloud.position.set(
        -radius - (i % 3) * 3,
        1.5 + Math.floor(i / 6) * 2.1,
        ((i % 6) - 2.5) * 2.4,
      );
      cloud.userData.baseY = cloud.position.y;
      this.front.add(cloud);
    }
    // 一个轻量无贴图平面表达风卷雪雾，限于左缘，不能遮住正前方操作区。
    this.mist = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: { opacity: { value: 0 }, clock: { value: 0 } },
        vertexShader: `varying vec2 uv0; void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 uv0; uniform float opacity; uniform float clock;
        void main(){
          float edge=pow(1.-smoothstep(0.,1.,uv0.x),1.7);
          float layers=.62+.20*sin(uv0.y*17.+uv0.x*8.-clock*1.8)
            +.12*sin(uv0.y*31.-uv0.x*12.+clock*1.1);
          float vertical=smoothstep(0.,.16,uv0.y)*(1.-smoothstep(.65,1.,uv0.y));
          gl_FragColor=vec4(mix(vec3(.55,.68,.73),vec3(.88,.95,.96),uv0.y),edge*layers*vertical*opacity);
        }`,
      }),
    );
    this.mist.renderOrder = 20;
    this.front.visible = this.mist.visible = false;
  }
  update(
    feedback: ReturnType<typeof avalancheFeedback>,
    time: number,
    viewWidth: number,
    viewHeight: number,
  ) {
    this.front.visible = this.mist.visible = feedback.enabled;
    for (const [i, cloud] of this.front.children.entries()) {
      // 不沿x漂移，前沿的真实路线位置保持不变；暂停时time冻结。
      cloud.position.y = cloud.userData.baseY + Math.sin(time * 3 + i) * 0.24;
      cloud.rotation.x = time * 0.18;
    }
    const width = viewWidth * 0.18;
    this.mist.position.set(-viewWidth / 2 + width / 2, -viewHeight * 0.04, -10);
    this.mist.scale.set(width, viewHeight, 1);
    this.mist.material.uniforms.opacity.value = feedback.mist;
    this.mist.material.uniforms.clock.value = time;
  }
}
