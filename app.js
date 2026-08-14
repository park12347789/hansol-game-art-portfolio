document.documentElement.classList.add('motion-ready');

class RevealDirector {
  constructor(reducedMotion) {
    this.reducedMotion = reducedMotion;
    this.targets = [...document.querySelectorAll(
      '.section-heading, .story-strip, .project-card, .proof-card, .gallery-grid figure, .about-portrait, .about-copy, .skill-groups > div, .contact-section'
    )];
    this.observer = null;
  }

  init() {
    if (this.reducedMotion) {
      this.finish();
      return;
    }
    if (!('IntersectionObserver' in window)) {
      console.error('Motion error: IntersectionObserver unavailable.');
      return;
    }

    this.targets.forEach((target, index) => {
      target.dataset.reveal = '';
      target.style.setProperty('--reveal-delay', `${(index % 4) * 85}ms`);
    });
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        this.observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    this.targets.forEach((target) => this.observer.observe(target));
  }

  finish() {
    this.observer?.disconnect();
    this.targets.forEach((target) => target.classList.add('visible'));
  }
}

class ScrollDirector {
  constructor(reducedMotion) {
    this.reducedMotion = reducedMotion;
    this.parallaxTargets = [...document.querySelectorAll('[data-parallax]')];
    this.sections = [...document.querySelectorAll('[data-chapter]')];
    this.storyWords = [...document.querySelectorAll('.story-words span')];
    this.storyStrip = document.querySelector('.story-strip');
    this.navLinks = [...document.querySelectorAll('.primary-nav a[href^="#"]')];
    this.chapterIndex = document.querySelector('[data-chapter-index]');
    this.chapterLabel = document.querySelector('[data-chapter-label]');
    this.frame = 0;
    this.onScroll = this.schedule.bind(this);
  }

  init() {
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    this.update();
  }

  setReducedMotion(reducedMotion) {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.parallaxTargets.forEach((target) => target.style.setProperty('--parallax-y', '0px'));
      this.storyWords.forEach((word) => word.style.setProperty('--story-x', '0px'));
    }
    this.schedule();
  }

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => this.update());
  }

  update() {
    this.frame = 0;
    const root = document.documentElement;
    const maxScroll = Math.max(root.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    root.style.setProperty('--scroll-progress', progress.toFixed(4));

    const paused = document.body.classList.contains('motion-paused');
    const motionActive = !this.reducedMotion && !paused;
    root.style.setProperty('--grid-shift', motionActive ? `${window.scrollY * 0.035}px` : '0px');

    if (motionActive) {
      this.parallaxTargets.forEach((target) => {
        const rect = target.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;
        const distance = rect.top + rect.height / 2 - window.innerHeight / 2;
        const offset = Math.max(-28, Math.min(28, distance * -0.045));
        target.style.setProperty('--parallax-y', `${offset.toFixed(2)}px`);
      });

      const storyRect = this.storyStrip.getBoundingClientRect();
      const storyProgress = Math.max(-1, Math.min(1, (window.innerHeight / 2 - storyRect.top) / window.innerHeight));
      this.storyWords.forEach((word, index) => {
        const direction = index % 2 ? -1 : 1;
        word.style.setProperty('--story-x', `${(storyProgress * direction * (index + 1) * 8).toFixed(2)}px`);
      });
    }

    let activeIndex = 0;
    this.sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.48) activeIndex = index;
    });
    const activeSection = this.sections[activeIndex];
    this.chapterIndex.textContent = String(activeIndex + 1).padStart(2, '0');
    this.chapterLabel.textContent = activeSection.dataset.chapter;
    this.navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${activeSection.id}`);
    });
  }
}

class PointerDirector {
  constructor(reducedMotion) {
    this.reducedMotion = reducedMotion;
    this.finePointer = window.matchMedia('(pointer: fine)').matches;
    this.tiltTargets = [...document.querySelectorAll('[data-tilt]')];
    this.magneticTargets = [...document.querySelectorAll('.button, .fab')];
    this.hotTargets = [...document.querySelectorAll('a, button, [data-tilt]')];
    this.enabled = false;
  }

  init() {
    if (!this.finePointer) return;
    document.addEventListener('pointermove', (event) => {
      if (!this.enabled) return;
      document.documentElement.style.setProperty('--pointer-x', `${event.clientX}px`);
      document.documentElement.style.setProperty('--pointer-y', `${event.clientY}px`);
      document.body.classList.add('pointer-ready');
    }, { passive: true });

    this.hotTargets.forEach((target) => {
      target.addEventListener('pointerenter', () => this.enabled && document.body.classList.add('pointer-hot'));
      target.addEventListener('pointerleave', () => document.body.classList.remove('pointer-hot'));
    });

    this.tiltTargets.forEach((target) => {
      target.addEventListener('pointermove', (event) => {
        if (!this.enabled) return;
        const rect = target.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        target.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`);
        target.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`);
      });
      target.addEventListener('pointerleave', () => {
        target.style.setProperty('--tilt-x', '0deg');
        target.style.setProperty('--tilt-y', '0deg');
      });
    });

    this.magneticTargets.forEach((target) => {
      target.addEventListener('pointermove', (event) => {
        if (!this.enabled) return;
        const rect = target.getBoundingClientRect();
        const x = Math.max(-8, Math.min(8, (event.clientX - rect.left - rect.width / 2) * 0.12));
        const y = Math.max(-8, Math.min(8, (event.clientY - rect.top - rect.height / 2) * 0.12));
        target.style.setProperty('--magnetic-x', `${x.toFixed(2)}px`);
        target.style.setProperty('--magnetic-y', `${y.toFixed(2)}px`);
      });
      target.addEventListener('pointerleave', () => {
        target.style.setProperty('--magnetic-x', '0px');
        target.style.setProperty('--magnetic-y', '0px');
      });
    });

    document.addEventListener('pointerdown', (event) => {
      const target = event.target.closest('.button, .fab, .nav-cta');
      if (!target || !this.enabled) return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      target.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });

    this.setEnabled(!this.reducedMotion);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled && this.finePointer);
    if (this.enabled) return;
    document.body.classList.remove('pointer-ready', 'pointer-hot');
    this.tiltTargets.forEach((target) => {
      target.style.setProperty('--tilt-x', '0deg');
      target.style.setProperty('--tilt-y', '0deg');
    });
  }
}

class CounterDirector {
  constructor(reducedMotion) {
    this.reducedMotion = reducedMotion;
    this.targets = [...document.querySelectorAll('[data-count]')];
  }

  init() {
    if (this.reducedMotion) {
      this.finish();
      return;
    }
    if (!('IntersectionObserver' in window)) {
      console.error('Motion error: IntersectionObserver unavailable for counters.');
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        this.animate(entry.target);
      });
    }, { threshold: 0.7 });
    this.targets.forEach((target) => observer.observe(target));
  }

  animate(target) {
    const finalValue = Number(target.dataset.count);
    const suffix = target.dataset.suffix || '';
    const start = performance.now();
    const duration = 1350;
    const frame = (time) => {
      if (document.body.classList.contains('motion-paused')) {
        target.textContent = `${finalValue}${suffix}`;
        return;
      }
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      target.textContent = `${Math.round(finalValue * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  finish() {
    this.targets.forEach((target) => {
      target.textContent = `${target.dataset.count}${target.dataset.suffix || ''}`;
    });
  }
}

class PortfolioApp {
  constructor() {
    this.menuButton = document.querySelector('.menu-button');
    this.navigation = document.querySelector('#primary-nav');
    this.motionToggle = document.querySelector('.motion-toggle');
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reveal = new RevealDirector(this.motionQuery.matches);
    this.scroll = new ScrollDirector(this.motionQuery.matches);
    this.pointer = new PointerDirector(this.motionQuery.matches);
    this.counter = new CounterDirector(this.motionQuery.matches);
  }

  init() {
    document.querySelector('[data-year]').textContent = new Date().getFullYear();
    this.setupMenu();
    this.setupMotionToggle();
    this.reveal.init();
    this.scroll.init();
    this.pointer.init();
    this.counter.init();
    this.motionQuery.addEventListener('change', (event) => this.applyMotionPreference(event.matches));
  }

  setupMenu() {
    this.menuButton.addEventListener('click', () => {
      const open = this.navigation.classList.toggle('open');
      this.menuButton.setAttribute('aria-expanded', String(open));
      this.menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    this.navigation.addEventListener('click', (event) => {
      if (!event.target.closest('a')) return;
      this.navigation.classList.remove('open');
      this.menuButton.setAttribute('aria-expanded', 'false');
      this.menuButton.setAttribute('aria-label', '메뉴 열기');
    });
  }

  setupMotionToggle() {
    this.motionToggle.addEventListener('click', () => {
      const paused = document.body.classList.toggle('motion-paused');
      this.motionToggle.setAttribute('aria-pressed', String(paused));
      this.motionToggle.setAttribute('aria-label', paused ? '애니메이션 재생' : '애니메이션 일시정지');
      this.motionToggle.textContent = paused ? 'FX OFF' : 'FX ON';
      this.pointer.setEnabled(!paused && !this.motionQuery.matches);
      this.scroll.schedule();
    });
  }

  applyMotionPreference(reducedMotion) {
    this.scroll.setReducedMotion(reducedMotion);
    this.pointer.setEnabled(!reducedMotion && !document.body.classList.contains('motion-paused'));
    if (reducedMotion) {
      this.reveal.finish();
      this.counter.finish();
    }
  }
}

new PortfolioApp().init();
