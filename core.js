/*
 *  6502 assembler and emulator in Javascript
 *  (C)2006-2009 Stian Soreng - www.6502asm.com
 *
 *  Released under the GNU General Public License
 *  see http://gnu.org/licenses/gpl.html
 *
 *
 *	Revised by Paolo Torricelli on 2011
 *
 */
function message(val)
{
	document.write(val+"<br>");
}

function cpu()
{
//	this.MAX_this.mem = ((32*32)-1);
	this.codeRunning = false;
}

cpu.prototype.reset=function () {
	this.regA = 0;
	this.regX = 0;
	this.regY = 0;
	this.regP = 0x20;
	this.regPC = 0x600;
	this.regSP = 0x100;
	this.memory=new Array(65536);
}

cpu.prototype.stackPush=function ( value ) 
{
  if( this.regSP >= 0 ) {
    this.regSP--;
    this.memory[(this.regSP & 0xff)+0x100] = value & 0xff;
  } else {
    message( "Stack full: " + this.regSP );
    this.codeRunning = false;
  }
}

cpu.prototype.stackPop=function () 
{
  if( this.regSP < 0x100 ) {
    value = this.memory[this.regSP+0x100];
    this.regSP++;
    return value;
  } else {
    message( "Stack empty" );
    this.codeRunning = false;
    return 0;
  }
}

cpu.prototype.popByte=function () 
{
  return( this.memory[this.regPC++] & 0xff );
}

cpu.prototype.popWord=function () 
{
  return this.popByte() + (this.popByte() << 8);
}

cpu.prototype.memStoreByte=function( addr, value ) 
{
  this.memory[ addr ] = (value & 0xff);
}

cpu.prototype.memReadByte=function( addr ) 
{
  if( addr == 0xfe ) return Math.floor( Math.random()*256 );
  return this.memory[addr];
}

cpu.prototype.jumpBranch=function( offset ) 
{
  if( offset > 0x7f )
    this.regPC = (this.regPC - (0x100 - offset));
  else
    this.regPC = (this.regPC + offset );
}

cpu.prototype.testSBC=function( value ) 
{
  if( (this.regA ^ value ) & 0x80 )
    vflag = 1;
  else
    vflag = 0;

  if( this.regP & 8 ) {
    tmp = 0xf + (this.regA & 0xf) - (value & 0xf) + (this.regP&1);
    if( tmp < 0x10 ) {
      w = 0;
      tmp -= 6;
    } else {
      w = 0x10;
      tmp -= 0x10;
    }
    w += 0xf0 + (this.regA & 0xf0) - (value & 0xf0);
    if( w < 0x100 ) {
      this.regP &= 0xfe;
      if( (this.regP&0xbf) && w<0x80) this.regP&=0xbf;
      w -= 0x60;
    } else {
      this.regP |= 1;
      if( (this.regP&0xbf) && w>=0x180) this.regP&=0xbf;
    }
    w += tmp;
  } else {
    w = 0xff + this.regA - value + (this.regP&1);
    if( w<0x100 ) {
      this.regP &= 0xfe;
      if( (this.regP&0xbf) && w<0x80 ) this.regP&=0xbf;
    } else {
      this.regP |= 1;
      if( (this.regP&0xbf) && w>= 0x180) this.regP&=0xbf;
    }
  }
  this.regA = w & 0xff;
  if( this.regA ) this.regP &= 0xfd; else this.regP |= 0x02;
  if( this.regA & 0x80 ) this.regP |= 0x80; else this.regP &= 0x7f;
}

cpu.prototype.testADC=function( value ) 
{
  if( (this.regA ^ value) & 0x80 ) {
    this.regP &= 0xbf;
  } else {
    this.regP |= 0x40;
  }

  if( this.regP & 8 ) {
    tmp = (this.regA & 0xf) + (value & 0xf) + (this.regP&1);
    if( tmp >= 10 ) {
      tmp = 0x10 | ((tmp+6)&0xf);
    }
    tmp += (this.regA & 0xf0) + (value & 0xf0);
    if( tmp >= 160) {
      this.regP |= 1;
      if( (this.regP&0xbf) && tmp >= 0x180 ) this.regP &= 0xbf;
      tmp += 0x60;
    } else {
      this.regP &= 0xfe;
      if( (this.regP&0xbf) && tmp<0x80 ) this.regP &= 0xbf;
    }
  } else {
    tmp = this.regA + value + (this.regP&1);
    if( tmp >= 0x100 ) {
      this.regP |= 1;
      if( (this.regP&0xbf) && tmp>=0x180) this.regP &= 0xbf;
    } else {
      this.regP &= 0xfe;
      if( (this.regP&0xbf) && tmp<0x80) this.regP &= 0xbf;
    }
  }
  this.regA = tmp & 0xff;
  if( this.regA ) this.regP &= 0xfd; else this.regP |= 0x02;
  if( this.regA & 0x80 ) this.regP |= 0x80; else this.regP &= 0x7f;
}

cpu.prototype.multiexecute=function() 
{
  for( w=0; w<128; w++ ) this.execute();
}

cpu.prototype.computeflags=function(reg)
{
	if( reg ) this.regP &= 0xfd; else this.regP |= 0x02;
	if( reg & 0x80 ) this.regP |= 0x80; else this.regP &= 0x7f;
}

cpu.prototype.doCompare=function( reg, val ) 
{
  if( (reg+val) > 0xff ) this.regP |= 1; else this.regP &= 0xfe;
  val = (reg-val);
//  if( reg+0x100-val > 0xff ) this.regP |= 1; else this.regP &= 0xfe;
//  val = reg+0x100-val;
	this.computeflags(val);
}
 
cpu.prototype.execute=function() 
{
  if( ! this.codeRunning ) return;

  opcode = this.popByte();
//  message( "PC=" + addr2hex(this.regPC-1) + " opcode=" + opcode + " X="+this.regX + " Y=" + this.regY + " A=" + this.regA );
  switch( opcode ) {
    case 0x00:                            // BRK implied
      this.codeRunning = false;
      break;
    case 0x01:                            // ORA INDX
      addr = this.popByte() + this.regX;
      value = this.memReadByte( addr ) + (this.memReadByte( addr+1) << 8);
      this.regA |= value;
	  this.computeflags(this.regA);
      break;
    case 0x05:                            // ORA ZP
      zp = this.popByte();
      this.regA |= this.memReadByte( zp );
	  this.computeflags(this.regA);
      break;
    case 0x06:                            // ASL ZP
      zp = this.popByte();
      value = this.memReadByte( zp );
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      this.memStoreByte( zp, value );
	  this.computeflags(value);
      break;
    case 0x08:                            // PHP
      this.stackPush( this.regP );
      break;
    case 0x09:                            // ORA IMM
      this.regA |= this.popByte();
	  this.computeflags(this.regA);
      break;
    case 0x0a:                            // ASL IMPL
      this.regP = (this.regP & 0xfe) | ((this.regA>>7)&1);
      this.regA = this.regA<<1;
	  this.computeflags(this.regA);
      break;
    case 0x0d:                            // ORA ABS
      this.regA |= this.memReadByte( this.popWord() );
	  this.computeflags(this.regA);
      break;
    case 0x0e:                            // ASL ABS
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x10:                            // BPL
      offset = this.popByte();
      if( (this.regP & 0x80) == 0 ) this.jumpBranch( offset );
      break;
    case 0x11:                            // ORA INDY
      zp = this.popByte();
      value = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      this.regA |= this.memReadByte(value);
	  this.computeflags(this.regA);
      break;
    case 0x15:                            // ORA ZPX
      addr = (this.popByte() + this.regX) & 0xff;
      this.regA |= this.memReadByte(addr);
	  this.computeflags(this.regA);
      break;
    case 0x16:                            // ASL ZPX
      addr = (this.popByte() + this.regX) & 0xff;
      value = this.memReadByte(addr);
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x18:                            // CLC
      this.regP &= 0xfe;
      break;
    case 0x19:                            // ORA ABSY
      addr = this.popWord() + this.regY;
      this.regA |= this.memReadByte( addr );
	  this.computeflags(this.regA);
      break;
    case 0x1d:                            // ORA ABSX
      addr = this.popWord() + this.regX;
      this.regA |= this.memReadByte( addr );
	  this.computeflags(this.regA);
      break;
    case 0x1e:                            // ASL ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x20:                            // JSR ABS
      addr = this.popWord();
      currAddr = this.regPC-1;
      this.stackPush( ((currAddr >> 8) & 0xff) );
      this.stackPush( (currAddr & 0xff) );
      this.regPC = addr;
      break;
    case 0x21:                            // AND INDX
      addr = (this.popByte() + this.regX)&0xff;
      value = this.memReadByte( addr ) + (this.memReadByte( addr+1) << 8);
      this.regA &= value;
	  this.computeflags(this.regA);
      break;
    case 0x24:                            // BIT ZP
      zp = this.popByte();
      value = this.memReadByte( zp );
      if( value & this.regA ) this.regP &= 0xfd; else this.regP |= 0x02;
      this.regP = (this.regP & 0x3f) | (value & 0xc0);
      break;
    case 0x25:                            // AND ZP
      zp = this.popByte();
      this.regA &= this.memReadByte( zp );
	  this.computeflags(this.regA);
      break;
    case 0x26:                            // ROL ZP
      sf = (this.regP & 1);
      addr = this.popByte();
      value = this.memReadByte( addr ); //  & this.regA;  -- Thanks DMSC ;)
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      value |= sf;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x28:                            // PLP
      this.regP = stackPop() | 0x20;
      break;
    case 0x29:                            // AND IMM
      this.regA &= this.popByte();
	  this.computeflags(this.regA);
      break;
    case 0x2a:                            // ROL A
      sf = (this.regP&1);
      this.regP = (this.regP&0xfe) | ((this.regA>>7)&1);
      this.regA = this.regA << 1;
      this.regA |= sf;
	  this.computeflags(this.regA);
      break;
    case 0x2c:                            // BIT ABS
      value = this.memReadByte( this.popWord() );
      if( value & this.regA ) this.regP &= 0xfd; else this.regP |= 0x02;
      this.regP = (this.regP & 0x3f) | (value & 0xc0);
      break;
    case 0x2d:                            // AND ABS
      value = this.memReadByte( this.popWord() );
      this.regA &= value;
	  this.computeflags(this.regA);
      break;
    case 0x2e:                            // ROL ABS
      sf = this.regP & 1;
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      value |= sf;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x30:                            // BMI
      offset = this.popByte();
      if( this.regP & 0x80 ) this.jumpBranch( offset );
      break;
    case 0x31:                            // AND INDY
      zp = this.popByte();
      value = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      this.regA &= this.memReadByte(value);
	  this.computeflags(this.regA);
      break;
    case 0x35:                            // AND INDX
      zp = this.popByte();
      value = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regX;
      this.regA &= this.memReadByte(value);
	  this.computeflags(this.regA);
      break;
    case 0x36:                            // ROL ZPX
      sf = this.regP & 1;
      addr = (this.popByte() + this.regX) & 0xff;
      value = this.memReadByte( addr );
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      value |= sf;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x38:                            // SEC
      this.regP |= 1;
      break;
    case 0x39:                            // AND ABSY
      addr = this.popWord() + this.regY;
      value = this.memReadByte( addr );
      this.regA &= value;
	  this.computeflags(this.regA);
      break;
    case 0x3d:                            // AND ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.regA &= value;
	  this.computeflags(this.regA);
      break;
    case 0x3e:                            // ROL ABSX
      sf = this.regP&1;
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.regP = (this.regP & 0xfe) | ((value>>7)&1);
      value = value << 1;
      value |= sf;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x40:                            // RTI (unsupported, =NOP)
      break;
    case 0x41:                            // EOR INDX
      zp = (this.popByte() + this.regX)&0xff;
      value = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      this.regA ^= this.memReadByte(value);
	  this.computeflags(this.regA);
      break;
    case 0x45:                            // EOR ZPX
      addr = (this.popByte() + this.regX) & 0xff;
      value = this.memReadByte( addr );
      this.regA ^= value;
	  this.computeflags(this.regA);
      break;
    case 0x46:                            // LSR ZP
      addr = this.popByte() & 0xff;
      value = this.memReadByte( addr );
      this.regP = (this.regP & 0xfe) | (value&1);
      value = value >> 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x48:                            // PHA
      this.stackPush( this.regA );
      break;
    case 0x49:                            // EOR IMM
      this.regA ^= this.popByte();
	  this.computeflags(this.regA);
      break;
    case 0x4a:                            // LSR
      this.regP = (this.regP&0xfe) | (this.regA&1);
      this.regA = this.regA >> 1;
	  this.computeflags(this.regA);
      break;
    case 0x4c:                            // JMP abs
      this.regPC = this.popWord();
      break;
    case 0x4d:                            // EOR abs
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.regA ^= value;
	  this.computeflags(this.regA);
      break;
    case 0x4e:                           // LSR abs
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe)|(value&1);
      value = value >> 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x50:                           // BVC (on overflow clear)
      offset = this.popByte();
      if( (this.regP & 0x40) == 0 ) this.jumpBranch( offset );
      break;
    case 0x51:                           // EOR INDY
      zp = this.popByte();
      value = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      this.regA ^= this.memReadByte(value);
	  this.computeflags(this.regA);
      break;
    case 0x55:                           // EOR ZPX
      addr = (this.popByte() + this.regX) & 0xff;
      this.regA ^= this.memReadByte( addr );
	  this.computeflags(this.regA);
      break;
    case 0x56:                           // LSR ZPX
      addr = (this.popByte() + this.regX) & 0xff;
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe) | (value&1);
      value = value >> 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x58:                           // CLI (does nothing)
      break;
    case 0x59:                           // EOR ABSY
      addr = this.popWord() + this.regY;
      value = this.memReadByte( addr );
      this.regA ^= value;
	  this.computeflags(this.regA);
      break;
    case 0x5d:                           // EOR ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.regA ^= value;
	  this.computeflags(this.regA);
      break;
    case 0x5e:                           // LSR ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe) | (value&1);
      value = value >> 1;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x60:                           // RTS
      this.regPC = (stackPop()+1) | (stackPop()<<8);
      break;
    case 0x61:                           // ADC INDX
      zp = (this.popByte() + this.regX)&0xff;
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      value = this.memReadByte( addr );
      this.testADC( value );
      break;
    case 0x65:                           // ADC ZP
      addr = this.popByte();
      value = this.memReadByte( addr );
      this.testADC( value );
      break;
    case 0x66:                           // ROR ZP
      sf = this.regP&1;
      addr = this.popByte();
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe)|(value&1);
      value = value >> 1;
      if( sf ) value |= 0x80;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x68:                           // PLA
      this.regA = stackPop();
	  this.computeflags(this.regA);
      break;
    case 0x69:                           // ADC IMM
      value = this.popByte();
      this.testADC( value );
      break;
    case 0x6a:                           // ROR A
      sf = this.regP&1;
      this.regP = (this.regP&0xfe) | (this.regA&1);
      this.regA = this.regA >> 1;
      if( sf ) this.regA |= 0x80;
	  this.computeflags(this.regA);
      break;
    case 0x6c: // JMP INDIR
      addr = this.popWord();
      this.regPC = this.memReadByte(addr) + (this.memReadByte(addr+1)<<8);
      break;
    case 0x6d:                           // ADC ABS
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.testADC( value );
      break;
    case 0x6e:                           // ROR ABS
      sf = this.regP&1;
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe)|(value&1);
      value = value >> 1;
      if( sf ) value |= 0x80;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x70:                           // BVS (branch on overflow set)
      offset = this.popByte();
      if( this.regP & 0x40 ) this.jumpBranch( offset );
      break;
    case 0x71:                           // ADC INY
      zp = this.popByte();
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      value = this.memReadByte( addr + this.regY );
      this.testADC( value );
      break;
    case 0x75:                           // ADC ZPX
      addr = (this.popByte() + this.regX) & 0xff;
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe) | (value&1);
      this.testADC( value );
      break;
    case 0x76:                           // ROR ZPX
      sf = (this.regP&1);
      addr = (this.popByte() + this.regX) & 0xff;
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe) | (value&1);
      value = value >> 1;
      if( sf ) value |= 0x80;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x78:                           // SEI (does nothing)
      break;
    case 0x79:                           // ADC ABSY
      addr = this.popWord();
      value = this.memReadByte( addr + this.regY );
      this.testADC( value );
      break;
    case 0x7d:                           // ADC ABSX
      addr = this.popWord();
      value = this.memReadByte( addr + this.regX );
      this.testADC( value );
      break;
    case 0x7e:                           // ROR ABSX
      sf = this.regP&1;
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe) | (value&1);
      value = value >> 1;
      if( value ) value |= 0x80;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0x81:                           // STA INDX
      zp = (this.popByte()+this.regX)&0xff;
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      this.memStoreByte( addr, this.regA );
      break;
    case 0x84:                           // STY ZP
      this.memStoreByte( this.popByte(), this.regY );
      break;
    case 0x85:                           // STA ZP
      this.memStoreByte( this.popByte(), this.regA );
      break;
    case 0x86:                           // STX ZP
      this.memStoreByte( this.popByte(), this.regX );
      break;
    case 0x88:                           // DEY (1 byte)
      this.regY = (this.regY-1) & 0xff;
      if( this.regY ) this.regP &= 0xfd; else this.regP |= 0x02;
      if( this.regY & 0x80 ) this.regP |= 0x80; else this.regP &= 0x7f;
      break;
    case 0x8a:                           // TXA (1 byte);
      this.regA = this.regX & 0xff;
	  this.computeflags(this.regA);
      break;
    case 0x8c:                           // STY abs
      this.memStoreByte( this.popWord(), this.regY );
      break;
    case 0x8d:                           // STA ABS (3 bytes)
      this.memStoreByte( this.popWord(), this.regA );
      break;
    case 0x8e:                           // STX abs
      this.memStoreByte( this.popWord(), this.regX );
      break;
    case 0x90:                           // BCC (branch on carry clear)
      offset = this.popByte();
      if( ( this.regP & 1 ) == 0 ) this.jumpBranch( offset );
      break;
    case 0x91:                           // STA INDY
      zp = this.popByte();
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      this.memStoreByte( addr, this.regA );
      break;
    case 0x94:                           // STY ZPX
      this.memStoreByte( this.popByte() + this.regX, this.regY );
      break;
    case 0x95:                           // STA ZPX
      this.memStoreByte( this.popByte() + this.regX, this.regA );
      break;
    case 0x96:                           // STX ZPY
      this.memStoreByte( this.popByte() + this.regY, this.regX );
      break;
    case 0x98:                           // TYA
      this.regA = this.regY & 0xff;
	  this.computeflags(this.regA);
      break;
    case 0x99:                           // STA ABSY
      this.memStoreByte( this.popWord() + this.regY, this.regA );
      break;
    case 0x9a:                           // TXS
      regSP = this.regX & 0xff;
      break;
    case 0x9d:                           // STA ABSX
      addr = this.popWord();
      this.memStoreByte( addr + this.regX, this.regA );
      break;
    case 0xa0:                           // LDY IMM
      this.regY = this.popByte();
	  this.computeflags(this.regY);
      break;
    case 0xa1:                           // LDA INDX
      zp = (this.popByte()+this.regX)&0xff;
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      this.regA = this.memReadByte( addr );
	  this.computeflags(this.regA);
      break;
    case 0xa2:                           // LDX IMM
      this.regX = this.popByte();
	  this.computeflags(this.regX);
      break;
    case 0xa4:                           // LDY ZP
      this.regY = this.memReadByte( this.popByte() );
	  this.computeflags(this.regY);
      break;
    case 0xa5:                           // LDA ZP
      this.regA = this.memReadByte( this.popByte() );
	  this.computeflags(this.regA);
      break;
    case 0xa6:                          // LDX ZP
      this.regX = this.memReadByte( this.popByte() );
	  this.computeflags(this.regX);
      break;
    case 0xa8:                          // TAY
      this.regY = this.regA & 0xff;
	  this.computeflags(this.regY);
      break;
    case 0xa9:                          // LDA IMM
      this.regA = this.popByte();
	  this.computeflags(this.regA);
      break;
    case 0xaa:                          // TAX
      this.regX = this.regA & 0xff;
	  this.computeflags(this.regX);
      break;
    case 0xac:                          // LDY ABS
      this.regY = this.memReadByte( this.popWord() );
	  this.computeflags(this.regY);
      break;
    case 0xad:                          // LDA ABS
      this.regA = this.memReadByte( this.popWord() );
	  this.computeflags(this.regA);
      break;
    case 0xae:                          // LDX ABS
      this.regX = this.memReadByte( this.popWord() );
	  this.computeflags(this.regX);
      break;
    case 0xb0:                          // BCS
      offset = this.popByte();
      if( this.regP & 1 ) this.jumpBranch( offset );
      break;
    case 0xb1:                          // LDA INDY
      zp = this.popByte();
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      this.regA = this.memReadByte( addr );
	  this.computeflags(this.regA);
      break; 
    case 0xb4:                          // LDY ZPX
      this.regY = this.memReadByte( this.popByte() + this.regX );
	  this.computeflags(this.regY);
      break;
    case 0xb5:                          // LDA ZPX
      this.regA = this.memReadByte( (this.popByte() + this.regX) & 0xff );
	  this.computeflags(this.regA);
      break;
    case 0xb6:                          // LDX ZPY
      this.regX = this.memReadByte( this.popByte() + this.regY );
	  this.computeflags(this.regX);
      break;
    case 0xb8:                          // CLV
      this.regP &= 0xbf;
      break;
    case 0xb9:                          // LDA ABSY
      addr = this.popWord() + this.regY;
      this.regA = this.memReadByte( addr );
	  this.computeflags(this.regA);
      break;
    case 0xba:                          // TSX
      this.regX = regSP & 0xff;
      break;
    case 0xbc:                          // LDY ABSX
      addr = this.popWord() + this.regX;
      this.regY = this.memReadByte( addr );
	  this.computeflags(this.regY);
      break;
    case 0xbd:                          // LDA ABSX
      addr = this.popWord() + this.regX;
      this.regA = this.memReadByte( addr );
	  this.computeflags(this.regA);
      break;
    case 0xbe:                          // LDX ABSY
      addr = this.popWord() + this.regY;
      this.regX = this.memReadByte( addr );
	  this.computeflags(this.regX);
      break;
    case 0xc0:                          // CPY IMM
      value = this.popByte();
      this.doCompare( this.regy, value );
      break;
    case 0xc1:                          // CMP INDY
      zp = this.popByte();
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      value = this.memReadByte( addr );
      this.doCompare( this.regA, value );
      break;
    case 0xc4:                          // CPY ZP
      value = this.memReadByte( this.popByte() );
      this.doCompare( this.regY, value );
      break;
    case 0xc5:                          // CMP ZP
      value = this.memReadByte( this.popByte() );
      this.doCompare( this.regA, value );
      break;
    case 0xc6:                          // DEC ZP
      zp = this.popByte();
      value = this.memReadByte( zp );
      --value;
      this.memStoreByte( zp, value&0xff );
	  this.computeflags(value);
      break;
    case 0xc8:                          // INY
      this.regY = (this.regY + 1) & 0xff;
	  this.computeflags(this.regY);
      break;
    case 0xc9:                          // CMP IMM
      value = this.popByte();
      doCompare( this.regA, value );
      break;
    case 0xca:                          // DEX
      this.regX = (this.regX-1) & 0xff;
	  this.computeflags(this.regX);
      break;
    case 0xcc:                          // CPY ABS
      value = this.memReadByte( this.popWord() );
      this.doCompare( this.regY, value );
      break;
    case 0xcd:                          // CMP ABS
      value = this.memReadByte( this.popWord() );
      this.doCompare( this.regA, value );
      break;
    case 0xce:                          // DEC ABS
      addr = this.popWord();
      value = this.memReadByte( addr );
      --value;
      value = value&0xff;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0xd0:                          // BNE
      offset = this.popByte();
//      if( (this.regP&2)==0 ) { oldPC = this.regPC; jumpBranch( offset ); message( "Jumping from " + addr2hex(oldPC) + " to " + addr2hex(this.regPC) ); } else { message( "NOT jumping!" ); }
      if( (this.regP&2)==0 ) this.jumpBranch( offset );
      break;
    case 0xd1:                          // CMP INDY
      zp = this.popByte();
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8) + this.regY;
      value = this.memReadByte( addr );
      this.doCompare( this.regA, value );
      break;
    case 0xd5:                          // CMP ZPX
      value = this.memReadByte( this.popByte() + this.regX );
      this.doCompare( this.regA, value );
      break;
    case 0xd6:                          // DEC ZPX
      addr = this.popByte() + this.regX;
      value = this.memReadByte( addr );
      --value;
      value = value&0xff;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0xd8:                          // CLD (CLear Decimal)
      this.regP &= 0xf7;
      break;
    case 0xd9:                          // CMP ABSY
      addr = this.popWord() + this.regY;
      value = this.memReadByte( addr );
      this.doCompare( this.regA, value );
      break;
    case 0xdd:                          // CMP ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      this.doCompare( this.regA, value );
      break;
    case 0xde:                          // DEC ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      --value;
      value = value&0xff;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0xe0:                          // CPX IMM
      value = this.popByte();
      this.doCompare( this.regX, value );
      break;
    case 0xe1:                          // SBC INDX
      zp = (this.popByte()+this.regX)&0xff;
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      value = this.memReadByte( addr );
      this.testSBC( value );
      break;
    case 0xe4:                          // CPX ZP
      value = this.memReadByte( this.popByte() );
      this.doCompare( this.regX, value );
      break;
    case 0xe5:                          // SBC ZP
      addr = this.popByte();
      value = this.memReadByte( addr );
      this.testSBC( value );
      break;
    case 0xe6:                          // INC ZP
      zp = this.popByte();
      value = this.memReadByte( zp );
      ++value;
      value = (value)&0xff;
      this.memStoreByte( zp, value );
	  this.computeflags(value);
      break;
    case 0xe8:                          // INX
      this.regX = (this.regX + 1) & 0xff;
	  this.computeflags(this.regX);
      break;
    case 0xe9:                         // SBC IMM
      value = this.popByte();
      this.testSBC( value );
      break;
    case 0xea:                         // NOP
      break;
    case 0xec:                         // CPX ABS
      value = this.memReadByte( this.popWord() );
      this.doCompare( this.regX, value );
      break;
    case 0xed:                         // SBC ABS
      addr = this.popWord();
      value = this.memReadByte( addr );
      this.testSBC( value );
      break;
    case 0xee:                         // INC ABS
      addr = this.popWord();
      value = this.memReadByte( addr );
      ++value;
      value = (value)&0xff;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0xf0:                         // BEQ
      offset = this.popByte();
      if( this.regP&2 ) this.jumpBranch( offset );
      break;
    case 0xf1:                         // SBC INDY
      zp = this.popByte();
      addr = this.memReadByte(zp) + (this.memReadByte(zp+1)<<8);
      value = this.memReadByte( addr + this.regY );
      this.testSBC( value );
      break;
    case 0xf5:                         // SBC ZPX
      addr = (this.popByte() + this.regX)&0xff;
      value = this.memReadByte( addr );
      this.regP = (this.regP&0xfe)|(value&1);
      this.testSBC( value );
      break;
    case 0xf6:                         // INC ZPX
      addr = this.popByte() + this.regX;
      value = this.memReadByte( addr );
      ++value;
      value=value&0xff;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    case 0xf8:                         // SED
      this.regP |= 8;
      break;
   case 0xf9:                          // SBC ABSY
      addr = this.popWord();
      value = this.memReadByte( addr + this.regY );
      this.testSBC( value );
      break;
    case 0xfd:                         // SBC ABSX
      addr = this.popWord();
      value = this.memReadByte( addr + this.regX );
      this.testSBC( value );
      break;
    case 0xfe: // INC ABSX
      addr = this.popWord() + this.regX;
      value = this.memReadByte( addr );
      ++value;
      value=value&0xff;
      this.memStoreByte( addr, value );
	  this.computeflags(value);
      break;
    default:
//      message( "Address $" + addr2hex(this.regPC) + " - unknown opcode " + opcode );
      this.codeRunning = false;
      break;
	}
 }
